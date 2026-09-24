import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common'
import { UserService } from '../services/user.service.js'

const actor = { internalId: 1n }
const uuid = '550e8400-e29b-41d4-a716-446655440000'
const target = {
  id: 2n,
  userId: uuid,
  status: 'ACTIVE',
  expiresAt: null,
  lockedUntil: null,
  passwordHash: 'old-hash',
  passwordChangedAt: new Date(),
}
const role = {
  id: 3n,
  roleId: uuid,
  roleType: 'BUSINESS',
  status: 'ACTIVE',
  permissions: [],
  elevatedDataScopes: [],
}

function createPrisma() {
  const tx = {
    user: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([{ id: 'u1', username: 'admin', roles: [] }]),
      create: vi.fn().mockResolvedValue({ userId: uuid, username: 'new-user' }),
      findUnique: vi
        .fn()
        .mockImplementation(({ where }) => Promise.resolve(where.id === 1n ? { userId: uuid, status: 'ACTIVE', expiresAt: null } : target)),
      update: vi.fn().mockResolvedValue(target),
    },
    role: {
      findMany: vi.fn().mockResolvedValue([role]),
      findUniqueOrThrow: vi.fn().mockResolvedValue(role),
    },
    userRole: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    session: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
    passwordHistory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  }
  return {
    ...tx,
    $transaction: vi.fn((operations: any) => (Array.isArray(operations) ? Promise.all(operations) : operations(tx))),
  }
}

describe('UserService', () => {
  it('returns a paginated user result', async () => {
    const prisma = createPrisma()
    const service = new UserService(prisma as any, { hash: vi.fn() } as any)
    const result = await service.page({ keyword: 'adm', page: 2, pageSize: 10 })
    expect(result).toMatchObject({ code: '000000', data: { total: 1, page: 2, pageSize: 10 } })
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }))
  })

  it('hashes the initial password when creating a user', async () => {
    const prisma = createPrisma()
    const passwords = { hash: vi.fn().mockResolvedValue('hashed-password') }
    const service = new UserService(prisma as any, passwords as any)
    await service.create({ username: 'new-user', password: 'Strong-password-123!', displayName: 'New User' }, actor)
    expect(passwords.hash).toHaveBeenCalledWith('Strong-password-123!')
    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ passwordHash: 'hashed-password' }),
      })
    )
    expect(
      JSON.stringify(prisma.auditLog.create.mock.calls, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    ).not.toContain('hashed-password')
  })

  it('converts duplicate usernames to a conflict error', async () => {
    const prisma = createPrisma()
    prisma.user.create.mockRejectedValue({ code: 'P2002' })
    const service = new UserService(prisma as any, { hash: vi.fn().mockResolvedValue('hash') } as any)
    await expect(
      service.create({ username: 'admin', password: 'Strong-password-123!', displayName: 'Admin' }, actor)
    ).rejects.toBeInstanceOf(ConflictException)
  })

  it.each(['roleIds', 'permissionIds', 'roleType', 'status'])('rejects embedded %s from profile endpoints', async (field) => {
    const prisma = createPrisma()
    const service = new UserService(prisma as any, { hash: vi.fn() } as any)
    await expect(
      service.create({ username: 'test', password: 'Strong-password-123!', displayName: 'Test', [field]: [] }, actor)
    ).rejects.toBeInstanceOf(BadRequestException)
    await expect(service.update(uuid, { displayName: 'Test', [field]: [] }, actor)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.user.create).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('assigns business roles with revocation history and a transactional audit', async () => {
    const prisma = createPrisma()
    const service = new UserService(prisma as any, {} as any)
    await service.roles(uuid, { roleIds: [uuid], reason: 'Job duties', expiresAt: '2099-01-01T00:00:00Z' }, actor)
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
    expect(prisma.userRole.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          roleId: 3n,
          grantedBy: uuid,
          expiresAt: new Date('2099-01-01T00:00:00Z'),
        }),
      })
    )
    expect(prisma.userRole.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          revokedBy: uuid,
          revokeReason: 'Job duties',
        }),
      })
    )
    expect(prisma.userRole.deleteMany).not.toHaveBeenCalled()
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 1n,
          resource: 'user',
          detail: expect.objectContaining({ before: [], after: [] }),
        }),
      })
    )
  })

  it('rejects assigning or removing the actor’s own roles', async () => {
    const prisma = createPrisma()
    prisma.user.findUnique.mockResolvedValue({ ...target, id: 1n })
    const service = new UserService(prisma as any, {} as any)
    await expect(service.roles(uuid, { roleIds: [], reason: 'Test' }, actor)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.userRole.updateMany).not.toHaveBeenCalled()
  })

  it.each(['SYSTEM', 'SECURITY', 'AUDIT'])('rejects %s bindings without approval', async (roleType) => {
    const prisma = createPrisma()
    prisma.role.findMany.mockResolvedValue([{ ...role, roleType }])
    prisma.role.findUniqueOrThrow.mockResolvedValue({ ...role, roleType })
    const service = new UserService(prisma as any, {} as any)
    await expect(service.roles(uuid, { roleIds: [uuid], reason: 'Test' }, actor)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.userRole.upsert).not.toHaveBeenCalled()
  })

  it('enforces administrative duty separation using types, not names', async () => {
    const prisma = createPrisma()
    const otherId = '550e8400-e29b-41d4-a716-446655440001'
    prisma.role.findMany.mockResolvedValue([
      { ...role, roleType: 'SECURITY' },
      { ...role, roleId: otherId, roleType: 'AUDIT' },
    ])
    const service = new UserService(prisma as any, {} as any)
    await expect(service.roles(uuid, { roleIds: [uuid, otherId], reason: 'Test' }, actor)).rejects.toThrow('职责互斥')
    expect(prisma.userRole.upsert).not.toHaveBeenCalled()
  })

  it('rejects revoking existing high-risk bindings through the ordinary path', async () => {
    const prisma = createPrisma()
    prisma.role.findMany.mockResolvedValue([])
    prisma.userRole.findMany.mockResolvedValue([{ roleId: 3n, revokedAt: null }] as any)
    prisma.role.findUniqueOrThrow.mockResolvedValue({ ...role, roleType: 'AUDIT' })
    await expect(new UserService(prisma as any, {} as any).roles(uuid, { roleIds: [], reason: 'Test' }, actor)).rejects.toBeInstanceOf(
      ForbiddenException
    )
    expect(prisma.userRole.updateMany).not.toHaveBeenCalled()
  })

  it('rejects BUSINESS roles that contain high-risk permissions', async () => {
    const prisma = createPrisma()
    prisma.role.findUniqueOrThrow.mockResolvedValue({
      ...role,
      permissions: [
        {
          permission: { code: '*', resource: '*', status: 'ACTIVE', requiredRoleType: 'BUSINESS' },
        },
      ],
    } as any)
    await expect(new UserService(prisma as any, {} as any).roles(uuid, { roleIds: [uuid], reason: 'Test' }, actor)).rejects.toBeInstanceOf(
      ForbiddenException
    )
  })

  it('requires the dedicated unlock endpoint and revokes sessions on disable', async () => {
    const prisma = createPrisma()
    const service = new UserService(prisma as any, {} as any)
    await service.status(uuid, { status: 'DISABLED', reason: 'Offboarding' }, actor)
    expect(prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }))
    prisma.user.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.id === 1n ? { userId: uuid, status: 'ACTIVE', expiresAt: null } : { ...target, status: 'LOCKED' })
    )
    await expect(service.status(uuid, { status: 'ACTIVE', reason: 'Test' }, actor)).rejects.toBeInstanceOf(BadRequestException)
    await service.unlock(uuid, 'Verified', actor)
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'ACTIVE', failedLogins: 0, lockedUntil: null } })
    )
  })

  it('resets passwords and revokes sessions atomically without unlocking or logging secrets', async () => {
    const prisma = createPrisma()
    const service = new UserService(
      prisma as any,
      {
        hash: vi.fn().mockResolvedValue('hashed-secret'),
        verify: vi.fn().mockResolvedValue(false),
      } as any
    )
    await service.resetPassword(uuid, 'Strong-password-123!', actor)
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 20_000,
    })
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 2n },
      data: { passwordHash: 'hashed-secret', passwordChangedAt: expect.any(Date) },
    })
    expect(prisma.passwordHistory.create).toHaveBeenCalledWith({
      data: { userId: 2n, passwordHash: 'old-hash', createdAt: expect.any(Date) },
    })
    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 2n, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(prisma.auditLog.create).toHaveBeenCalled()
    expect(
      JSON.stringify(prisma.auditLog.create.mock.calls, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    ).not.toMatch(/hashed-secret|old-hash|Strong-password/)
  })

  it.each(['old-hash', 'historical-hash'])('rejects reset reuse of %s even within the minimum age', async (reused) => {
    const prisma = createPrisma()
    prisma.passwordHistory.findMany.mockResolvedValue([{ passwordHash: 'historical-hash' }] as any)
    const passwords = {
      hash: vi.fn(),
      verify: vi.fn(async (_password: string, hash: string) => hash === reused),
    }
    await expect(new UserService(prisma as any, passwords as any).resetPassword(uuid, 'Strong-password-123!', actor)).rejects.toThrow(
      '历史密码'
    )
    expect(passwords.hash).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.session.updateMany).not.toHaveBeenCalled()
    expect(prisma.passwordHistory.create).not.toHaveBeenCalled()
  })

  it('rejects weak reset passwords before writes', async () => {
    const prisma = createPrisma()
    await expect(new UserService(prisma as any, {} as any).resetPassword(uuid, 'weak', actor)).rejects.toBeInstanceOf(BadRequestException)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.passwordHistory.create).not.toHaveBeenCalled()
  })

  it('preserves self-reset and administrator reset protections', async () => {
    const prisma = createPrisma()
    prisma.user.findUnique.mockResolvedValue({ ...target, id: 1n })
    const service = new UserService(prisma as any, {} as any)
    await expect(service.resetPassword(uuid, 'Strong-password-123!', actor)).rejects.toThrow('本人密码修改')
    prisma.user.findUnique.mockResolvedValue(target)
    prisma.userRole.findMany.mockResolvedValue([{ roleId: 3n }] as any)
    prisma.role.findUniqueOrThrow.mockResolvedValue({ ...role, roleType: 'SECURITY' })
    await expect(service.resetPassword(uuid, 'Strong-password-123!', actor)).rejects.toBeInstanceOf(ForbiddenException)
    expect(prisma.passwordHistory.findMany).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('propagates reset audit failure through the transaction for rollback', async () => {
    const prisma = createPrisma()
    prisma.auditLog.create.mockRejectedValue(new Error('Audit unavailable'))
    const passwords = {
      hash: vi.fn().mockResolvedValue('hashed-secret'),
      verify: vi.fn().mockResolvedValue(false),
    }
    await expect(new UserService(prisma as any, passwords as any).resetPassword(uuid, 'Strong-password-123!', actor)).rejects.toThrow(
      'Audit unavailable'
    )
    expect(prisma.passwordHistory.create).toHaveBeenCalledOnce()
  })

  it('fails the mutation when its audit cannot be recorded', async () => {
    const prisma = createPrisma()
    prisma.auditLog.create.mockRejectedValue(new Error('Audit unavailable'))
    await expect(new UserService(prisma as any, {} as any).roles(uuid, { roleIds: [uuid], reason: 'Test' }, actor)).rejects.toThrow(
      'Audit unavailable'
    )
  })
})
