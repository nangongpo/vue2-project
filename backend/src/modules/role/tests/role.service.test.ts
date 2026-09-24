import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { RoleService } from '../services/role.service.js'
import { grantInput, ordinaryPermission } from '../domain/authorization.js'

const actor = { internalId: 1n, traceId: 'trace' }
const uuid = '550e8400-e29b-41d4-a716-446655440000'
const permission = {
  id: uuid,
  code: 'business.order.read',
  resource: 'order',
  requiredRoleType: 'BUSINESS',
  type: 'API',
  method: 'GET',
  path: '/api/v1/orders',
  status: 'ACTIVE',
}
const role = {
  id: 2n,
  roleId: uuid,
  code: 'operator',
  roleType: 'BUSINESS',
  status: 'ACTIVE',
  permissions: [],
  elevatedDataScopes: [],
}
function fixture() {
  const tx = {
    user: {
      findUnique: vi.fn().mockResolvedValue({ userId: uuid, status: 'ACTIVE', expiresAt: null }),
    },
    role: {
      findUnique: vi.fn().mockResolvedValue(role),
      findUniqueOrThrow: vi.fn().mockResolvedValue(role),
      create: vi.fn().mockResolvedValue(role),
      update: vi.fn().mockResolvedValue(role),
      delete: vi.fn(),
    },
    permission: { findMany: vi.fn().mockResolvedValue([permission]) },
    userRole: { findFirst: vi.fn().mockResolvedValue(null) },
    rolePermission: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  }
  const prisma = { ...tx, $transaction: vi.fn((fn: any) => fn(tx)) }
  return { tx, prisma, service: new RoleService(prisma as any) }
}

describe('RoleService', () => {
  it('lists roles with user counts', async () => {
    const prisma = {
      role: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'r1',
            publicId: 'public-role-1',
            code: 'admin',
            permissions: [],
            _count: { users: 1 },
          },
        ]),
      },
    }
    const result = await new RoleService(prisma as any).list()
    expect(result).toMatchObject({ code: '000000', data: [{ code: 'admin' }] })
  })

  it('converts duplicate role codes to a conflict error', async () => {
    const { tx, service } = fixture()
    tx.role.create.mockRejectedValue({ code: 'P2002' })
    await expect(service.create({ code: 'admin', name: 'Admin' }, actor)).rejects.toBeInstanceOf(ConflictException)
  })

  it('creates BUSINESS roles only and audits inside a serializable transaction', async () => {
    const { tx, prisma, service } = fixture()
    await service.create({ code: 'operator', name: 'Operator' }, actor)
    expect(tx.role.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ roleType: 'BUSINESS' }) }))
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ actorId: 1n, action: 'system.role.create' }),
      })
    )
  })

  it.each(['roleType', 'permissionIds', 'status'])('rejects embedded %s for create and update', async (field) => {
    const { tx, service } = fixture()
    const input = { code: 'operator', name: 'Operator', [field]: [] }
    await expect(service.create(input, actor)).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.update(uuid, input, actor)).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.role.create).not.toHaveBeenCalled()
  })

  it.each(['PAGE', 'BUTTON', 'API'])('grants only explicitly selected %s resources and keeps revocation history', async (type) => {
    const { tx, prisma, service } = fixture()
    tx.permission.findMany.mockResolvedValue([{ ...permission, type }])
    await service.grants(uuid, { permissionIds: [uuid], reason: 'Job duties' }, actor)
    expect(tx.rolePermission.upsert).toHaveBeenCalledTimes(1)
    expect(tx.rolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          permissionId: uuid,
          grantedBy: uuid,
          grantReason: 'Job duties',
        }),
      })
    )
    expect(tx.rolePermission.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ permissionId: { notIn: [uuid] } }),
        data: expect.objectContaining({ revokedAt: expect.any(Date), revokedBy: uuid }),
      })
    )
    expect(tx.rolePermission.deleteMany).not.toHaveBeenCalled()
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          detail: expect.objectContaining({ before: [], after: [], reason: 'Job duties' }),
        }),
      })
    )
  })

  it.each([
    { code: '*' },
    { code: 'system.permission.manage' },
    { status: 'DISABLED' },
    { requiredRoleType: 'SECURITY' },
    { resource: 'user' },
    { resource: 'users' },
    { code: 'system.audit.export' },
    { path: '/api/v1/roles/:id/grants' },
    { path: '/orders/*' },
    { method: 'ALL' },
  ])('rejects protected or invalid grant %j', async (override) => {
    const { tx, service } = fixture()
    tx.permission.findMany.mockResolvedValue([{ ...permission, ...override }])
    await expect(service.grants(uuid, { permissionIds: [uuid], reason: 'Test' }, actor)).rejects.toBeInstanceOf(BadRequestException)
    expect(tx.rolePermission.upsert).not.toHaveBeenCalled()
    expect(tx.rolePermission.updateMany).not.toHaveBeenCalled()
  })

  it('rejects changes to the actor’s own role grants and status', async () => {
    const { tx, service } = fixture()
    tx.userRole.findFirst.mockResolvedValue({ userId: 1n } as any)
    await expect(service.grants(uuid, { permissionIds: [uuid], reason: 'Test' }, actor)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.status(uuid, { status: 'DISABLED', reason: 'Test' }, actor)).rejects.toBeInstanceOf(ForbiddenException)
    expect(tx.rolePermission.upsert).not.toHaveBeenCalled()
    expect(tx.role.update).not.toHaveBeenCalled()
  })

  it.each(['SYSTEM', 'SECURITY', 'AUDIT'])('protects %s roles from ordinary changes', async (roleType) => {
    const { tx, service } = fixture()
    tx.role.findUniqueOrThrow.mockResolvedValue({ ...role, roleType })
    await expect(service.grants(uuid, { permissionIds: [], reason: 'Test' }, actor)).rejects.toBeInstanceOf(ForbiddenException)
    await expect(service.update(uuid, { code: 'other', name: 'Other' }, actor)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects disabled target roles and nonexistent permissions', async () => {
    const { tx, service } = fixture()
    tx.role.findUnique.mockResolvedValueOnce({ ...role, status: 'DISABLED' })
    await expect(service.grants(uuid, { permissionIds: [uuid], reason: 'Test' }, actor)).rejects.toBeInstanceOf(BadRequestException)
    tx.permission.findMany.mockResolvedValue([])
    await expect(service.grants(uuid, { permissionIds: [uuid], reason: 'Test' }, actor)).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each(['users', 'permissions', 'dataScopes', 'elevatedDataScopes'])(
    'does not delete roles with %s references, including historical references',
    async (reference) => {
      const { tx, service } = fixture()
      tx.role.findUnique.mockResolvedValue({
        ...role,
        _count: { users: 0, permissions: 0, dataScopes: 0, elevatedDataScopes: 0, [reference]: 1 },
      } as any)
      await expect(service.remove(uuid, actor)).rejects.toBeInstanceOf(ConflictException)
      expect(tx.role.delete).not.toHaveBeenCalled()
    }
  )

  it('propagates audit failure so the transaction cannot commit', async () => {
    const { tx, service } = fixture()
    tx.permission.findMany.mockResolvedValue([])
    tx.auditLog.create.mockRejectedValue(new Error('Audit unavailable'))
    await expect(service.grants(uuid, { permissionIds: [], reason: 'Revoke' }, actor)).rejects.toThrow('Audit unavailable')
  })

  it('validates UUIDs, duplicate IDs, reason and future expiry', () => {
    for (const [ids, reason, expiry] of [
      [['bad'], 'Test', undefined],
      [[uuid, uuid], 'Test', undefined],
      [[], ' ', undefined],
      [[], 'Test', '2020-01-01'],
      [[], 'Test', 'invalid'],
    ] as const) {
      expect(() => grantInput([...ids], reason, expiry)).toThrow(BadRequestException)
    }
    expect(ordinaryPermission(permission)).toBe(true)
  })
})
