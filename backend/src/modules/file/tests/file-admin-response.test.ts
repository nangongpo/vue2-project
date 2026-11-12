import { describe, expect, it, vi } from 'vitest'
import { resolveRiskDecision } from '#app/security/policies/risk-policy.js'
import { FileAdminService } from '#app/modules/file/file-admin.service.js'

const file = {
  id: 'file-id', tenantId: 'tenant-secret', ownerUserId: 'user-secret', storageKey: 'storage-secret',
  originalName: 'image.png', safeName: 'image.png', size: 123n, classification: 'INTERNAL',
  status: 'READY', scanStatus: 'CLEAN', scanDetail: 'OK', declaredMime: 'image/png', detectedMime: 'image/png',
  sha256: 'hash', scanEngineVersion: 'clamav', policyVersion: null,
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
  owner: { username: 'owner', displayName: '上传人', userId: 'user-secret', password: 'secret' },
  uploads: [{ id: 'upload-secret', purpose: 'internal-purpose' }],
  bindings: [{ id: 'binding-id', resourceType: 'order', resourceId: 'order-id', fieldName: 'image', visibility: 'INTERNAL', tenantId: 'tenant-secret', createdBy: 'user-secret' }],
}

function setup() {
  const prisma = {
    fileObject: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([file]), findFirst: vi.fn().mockResolvedValue(file) },
    user: { findUnique: vi.fn().mockResolvedValue({ roles: [] }) },
    $queryRaw: vi.fn(),
    fileBinding: { findMany: vi.fn().mockResolvedValue([]) },
    operationPolicy: { findFirst: vi.fn().mockResolvedValue(null) },
    fileManagementCommand: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    $transaction: vi.fn(async (tasks) => typeof tasks === 'function' ? tasks(prisma) : Promise.all(tasks)),
  }
  const approvals = { registerExecutionHandler: vi.fn(), createInternal: vi.fn().mockResolvedValue({ data: { id: 'approval-secret', payload: file } }) }
  const scopes = { where: vi.fn().mockResolvedValue({ tenantId: 'tenant-secret' }) }
  const policies = { resolve: vi.fn(async (code) => resolveRiskDecision(code)) }
  const audit = { record: vi.fn() }
  const scans = { cancel: vi.fn(), enqueue: vi.fn().mockResolvedValue('job') }
  Object.assign(prisma.fileObject, { update: vi.fn().mockResolvedValue(file), findUniqueOrThrow: vi.fn().mockResolvedValue(file) })
  const service = new FileAdminService(prisma as any, scans as any, approvals as any, scopes as any, policies as any, audit as any)
  const actor = { internalId: 1n, userId: 'actor', tenantId: 'tenant-secret', mfaEnabled: true,
    mfaVerifiedAt: new Date(), reauthenticatedAt: new Date(),
    permissions: ['system.file.admin.delete', 'system.file.admin.reject', 'system.file.admin.restore', 'system.file.admin.scan'] } as any
  return { service, prisma, approvals, actor, audit, policies, scans }
}

describe('file management response minimization', () => {
  it('keeps only table fields and removes unused nested identity and relation fields', async () => {
    const { service, actor } = setup()
    const result = await service.page({} as any, actor)
    const item = result.data.items[0]
    expect(Object.keys(item).sort()).toEqual(['id', 'originalName', 'safeName', 'size', 'createdAt', 'statusLabel', 'statusTone', 'scanStatusLabel', 'scanStatusTone', 'availableActions', 'owner', 'bindings'].sort())
    expect(item.owner).toEqual({ username: 'owner', displayName: '上传人' })
    expect(item.bindings).toEqual([{ resourceType: 'order', resourceId: 'order-id', fieldName: 'image' }])
    expect(item.size).toBe('123')
    expect(JSON.stringify(result)).not.toContain('secret')
  })

  it('keeps detail display fields, Chinese classification and timestamps without leaking other file columns', async () => {
    const { service, prisma, actor } = setup()
    const { data } = await service.detail('file-id', actor)
    expect(Object.keys(data).sort()).toEqual(['id', 'originalName', 'safeName', 'size', 'declaredMime', 'detectedMime', 'createdAt', 'updatedAt', 'sha256', 'scanEngineVersion', 'policyVersion', 'scanDetail', 'classificationLabel', 'bindings'].sort())
    expect(data.classificationLabel).toBe('内部')
    expect(data.createdAt).toEqual(file.createdAt)
    expect(data.updatedAt).toEqual(file.updatedAt)
    expect(data.bindings).toEqual([{ id: 'binding-id', resourceType: 'order', resourceId: 'order-id', fieldName: 'image', visibility: 'INTERNAL' }])
    expect(JSON.stringify(data)).not.toContain('secret')
    expect(prisma.fileObject.findFirst.mock.calls[0][0].select).not.toHaveProperty('uploads')
  })

  it.each(['rescan', 'reject', 'delete'] as const)('%s executes an unbound operation without approval and audits in the transaction', async (method) => {
    const { service, approvals, actor, audit, prisma } = setup()
    vi.spyOn(service as any, 'authorizeActor').mockResolvedValue(undefined)
    const result = await service[method]('file-id', '操作原因', actor, actor)
    expect(approvals.createInternal).not.toHaveBeenCalled()
    expect(result.data).toEqual({ status: 'EXECUTED', riskLevel: 'L2' })
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ riskLevel: 'L2' }), prisma)
  })

  it('requires approval for a bound delete and returns a minimal pending result', async () => {
    const { service, approvals, actor, prisma } = setup()
    vi.spyOn(service as any, 'authorizeActor').mockResolvedValue(undefined)
    prisma.fileBinding.findMany.mockResolvedValue(file.bindings as any)
    expect((await service.delete('file-id', '操作原因', actor, actor)).data).toEqual({ status: 'PENDING_APPROVAL', riskLevel: 'L3' })
    expect(approvals.createInternal).toHaveBeenCalledTimes(1)
  })

  it('rejects a missing second factor instead of falling back to password', async () => {
    const { service, actor } = setup()
    vi.spyOn(service as any, 'authorizeActor').mockResolvedValue(undefined)
    await expect(service.delete('file-id', '操作原因', actor, { ...actor, mfaEnabled: false })).rejects.toThrow('绑定多因素认证')
  })

  it('returns a durable prior command without executing or applying terminal state checks again', async () => {
    const { service, actor, prisma, scans } = setup()
    vi.spyOn(service as any, 'authorizeActor').mockResolvedValue(undefined)
    await service.delete('file-id', '操作原因', actor, actor, 'stable-key')
    const command = prisma.fileManagementCommand.create.mock.calls[0][0].data
    prisma.fileManagementCommand.findUnique.mockResolvedValue(command as any)
    prisma.fileObject.findFirst.mockResolvedValue({ ...file, status: 'DELETED' })
    expect((await service.delete('file-id', '操作原因', actor, actor, 'stable-key')).data.status).toBe('EXECUTED')
    expect(scans.cancel).toHaveBeenCalledTimes(1)
  })
})
