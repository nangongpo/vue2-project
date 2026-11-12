import { PrismaClient, Prisma } from '@prisma/client'
import { randomUUID, createHash } from 'node:crypto'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { FileAdminService } from '#app/modules/file/file-admin.service.js'
import { FileScanService } from '#app/modules/file/file-scan.service.js'
import { OperationPolicyService } from '#app/security/services/operation-policy.service.js'
import { AuditService } from '#app/audit/services/audit.service.js'
import { ApprovalService } from '#app/modules/permission/services/approval.service.js'
import { lockedFileTarget } from '#app/modules/file/file-operation-policy.js'

const db = new PrismaClient()
const files: string[] = []; const traces: string[] = []; const keys: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await db.fileManagementCommand.deleteMany({ where: { requestKey: { in: keys } } })
  await db.auditLog.deleteMany({ where: { traceId: { in: traces } } })
  await db.fileBinding.deleteMany({ where: { fileId: { in: files } } })
  await db.fileObject.deleteMany({ where: { id: { in: files } } })
  files.length = 0; traces.length = 0; keys.length = 0
})
afterAll(() => db.$disconnect())

async function setup(status: 'READY' | 'REJECTED' = 'READY') {
  const parent = await db.fileObject.findFirstOrThrow({ select: { tenantId: true, organizationId: true, departmentId: true, ownerUserId: true } })
  const owner = await db.user.findUniqueOrThrow({ where: { userId: parent.ownerUserId }, select: { id: true } })
  const file = await db.fileObject.create({ data: { ...parent, storageKey: `integration-risk/${randomUUID()}`, originalName: 'risk-test.txt', safeName: 'risk-test.txt', size: 4n, sha256: 'a'.repeat(64), status, scanStatus: status === 'READY' ? 'CLEAN' : 'INFECTED', securityHold: status === 'REJECTED' ? 'MALWARE' : null } })
  files.push(file.id)
  const traceId = randomUUID(); traces.push(traceId)
  const actor = { internalId: owner.id, tenantId: parent.tenantId, userId: parent.ownerUserId, traceId, displayName: '风险集成测试', mfaEnabled: true, mfaVerifiedAt: new Date(), reauthenticatedAt: new Date(), permissions: ['system.file.admin.delete', 'system.file.admin.reject', 'system.file.admin.restore'] } as any
  const scope = { where: async () => ({ tenantId: parent.tenantId, id: file.id }) }
  const approvals = { registerExecutionHandler: vi.fn(), createInternal: vi.fn() }
  const audit = new AuditService(db as any)
  const service = new FileAdminService(db as any, new FileScanService(db as any), approvals as any, scope as any, new OperationPolicyService(db as any), audit)
  vi.spyOn(service as any, 'authorizeActor').mockResolvedValue(undefined)
  const key = randomUUID()
  keys.push(createHash('sha256').update(JSON.stringify([actor.tenantId, String(actor.internalId), 'FILE_DELETE', file.id, key])).digest('hex'))
  const binding = () => ({ fileId: file.id, tenantId: file.tenantId, resourceType: 'integration-risk', resourceId: randomUUID(), createdBy: actor.userId })
  return { file, actor, service, approvals, audit, key, binding }
}

describe('file operation risk MySQL transactions', () => {
  it.each(['READY', 'REJECTED'] as const)('soft-deletes an unbound %s file at L2 and durably replays the result', async (status) => {
    const { file, actor, service, approvals, key } = await setup(status)
    const first = await service.delete(file.id, '集成测试删除', actor, actor, key)
    expect(first.data).toEqual({ status: 'EXECUTED', riskLevel: 'L2' })
    expect((await db.fileObject.findUniqueOrThrow({ where: { id: file.id } }))).toMatchObject({ status: 'DELETED', deletedFromStatus: status, securityHold: status === 'REJECTED' ? 'MALWARE' : null })
    expect(await service.delete(file.id, '集成测试删除', actor, actor, key)).toEqual(first)
    expect(approvals.createInternal).not.toHaveBeenCalled()
    expect(await db.auditLog.count({ where: { traceId: actor.traceId } })).toBe(1)
  })
  it('observes a concurrent binding committed under the same file lock and requires L3', async () => {
    const { file, actor, service, approvals, key, binding } = await setup()
    let acquired!: () => void; let release!: () => void
    const ready = new Promise<void>((resolve) => { acquired = resolve })
    const gate = new Promise<void>((resolve) => { release = resolve })
    const attach = db.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM sys_file_object WHERE id = ${file.id} FOR UPDATE`)
      await tx.fileBinding.create({ data: binding() }); acquired(); await gate
    })
    await ready
    const deletion = service.delete(file.id, '集成测试并发删除', actor, actor, key)
    release(); await attach
    expect((await deletion).data).toEqual({ status: 'PENDING_APPROVAL', riskLevel: 'L3' })
    expect(approvals.createInternal).toHaveBeenCalledTimes(1)
    expect((await db.fileObject.findUniqueOrThrow({ where: { id: file.id } })).status).toBe('READY')
  })
  it('rejects a stale approval after the business references change', async () => {
    const { file, actor, binding } = await setup()
    const target = await db.$transaction((tx) => lockedFileTarget(tx, file.id, file.tenantId, 'FILE_DELETE'))
    await db.fileBinding.create({ data: binding() })
    const approval = new ApprovalService(db as any, undefined, { where: async () => ({ tenantId: file.tenantId, id: file.id }) } as any)
    await expect(db.$transaction((tx) => (approval as any).validateTarget(tx, 'FILE_DELETE', { fileId: file.id, targetSnapshot: target.snapshot }, [], actor.tenantId, actor))).rejects.toThrow('重新申请审批')
  })
  it('rolls back the soft delete and durable receipt when audit persistence fails', async () => {
    const { file, actor, service, audit, key } = await setup()
    vi.spyOn(audit, 'record').mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(service.delete(file.id, '集成测试回滚', actor, actor, key)).rejects.toThrow('audit unavailable')
    expect((await db.fileObject.findUniqueOrThrow({ where: { id: file.id } })).status).toBe('READY')
    expect(await db.fileManagementCommand.count({ where: { requestKey: { in: keys } } })).toBe(0)
  })
})
