import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthService } from '../services/auth.service.js'

afterEach(() => vi.unstubAllEnvs())

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
    user: {
      id: 1n,
      userId: 'public-user-1',
      username: 'admin',
      displayName: '管理员',
      status: 'ACTIVE',
      failedLogins: 0,
      lastLoginAt: null,
      lastLoginIp: null,
      roles: [],
    },
    ...overrides,
  }
}

describe('AuthService session lifecycle', () => {
  it('revokes an idle session and rejects authentication', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const prisma = {
      session: {
        findUnique: vi.fn().mockResolvedValue(session({ lastSeenAt: new Date(Date.now() - 3_600_000) })),
        update,
      },
    } as any
    const service = new AuthService(prisma, {} as any, { increment: vi.fn() } as any)
    process.env.SESSION_IDLE_TTL_SECONDS = '1800'

    await expect(service.authenticate('raw-token')).rejects.toThrow('闲置超时')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }))
  })

  it('refreshes lastSeenAt for an active session', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const prisma = { session: { findUnique: vi.fn().mockResolvedValue(session()), update } } as any
    const service = new AuthService(prisma, {} as any, { increment: vi.fn() } as any)

    await expect(service.authenticate('raw-token')).resolves.toMatchObject({
      userId: 'public-user-1',
      internalId: 1n,
      username: 'admin',
    })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastSeenAt: expect.any(Date) } }))
  })

  it('lists active sessions and marks the current session', async () => {
    const findMany = vi.fn().mockResolvedValue([session({ id: 'current-session' }), session({ id: 'other-session' })])
    const prisma = { session: { findMany } } as any
    const service = new AuthService(prisma, {} as any, { increment: vi.fn() } as any)
    vi.spyOn(service as any, 'hashToken').mockReturnValue('current-session')

    const result = await service.listSessions(1n, 'raw-token')

    expect(result.map((item) => item.current)).toEqual([true, false])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 1n, revokedAt: null }) }))
  })

  it('increments failed passwords atomically and locks at the configured limit', async () => {
    const user = {
      id: 'user-1',
      username: 'admin',
      passwordHash: 'hash',
      status: 'ACTIVE',
      failedLogins: 2,
      lockedUntil: null,
      roles: [],
    }
    const update = vi.fn().mockResolvedValueOnce({ failedLogins: 3 }).mockResolvedValueOnce({})
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user), update },
      session: {},
    } as any
    const passwords = { verify: vi.fn().mockResolvedValue(false) } as any
    const service = new AuthService(prisma, passwords, {
      increment: vi.fn().mockResolvedValue(1),
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(true),
    } as any)
    const originalLimit = process.env.LOGIN_FAILURE_LIMIT
    process.env.LOGIN_FAILURE_LIMIT = '3'

    await expect(service.login(' admin ', 'wrong', '127.0.0.1')).rejects.toThrow('请先完成滑块验证')

    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { failedLogins: { increment: 1 } } }))
    expect(update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { lockedUntil: expect.any(Date) } }))
    process.env.LOGIN_FAILURE_LIMIT = originalLimit
  })

  it('applies login request rate limiting by IP before database authentication', async () => {
    const findUnique = vi.fn()
    const prisma = { user: { findUnique } } as any
    const service = new AuthService(
      prisma,
      {} as any,
      {
        increment: vi.fn().mockResolvedValue(11),
        acquireLock: vi.fn().mockResolvedValue(true),
        releaseLock: vi.fn().mockResolvedValue(true),
      } as any
    )
    const originalLimit = process.env.LOGIN_RATE_LIMIT
    process.env.LOGIN_RATE_LIMIT = '10'

    await expect(service.login('admin', 'password', '127.0.0.1')).rejects.toThrow('登录请求过于频繁')
    expect(findUnique).not.toHaveBeenCalled()
    process.env.LOGIN_RATE_LIMIT = originalLimit
  })
})

function transactionFixture() {
  const user = {
    ...session().user,
    passwordHash: 'old-hash',
    passwordChangedAt: null,
    mfaEnabled: false,
    mfaSecret: null,
  }
  const tx = {
    user: { findUnique: vi.fn().mockResolvedValue(user), update: vi.fn() },
    session: { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn(), create: vi.fn() },
    passwordHistory: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  }
  const prisma = {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    $transaction: vi.fn(async (work: any) => work(tx)),
  }
  const passwords = {
    verify: vi.fn(async (password: string) => password === 'Current-password-123!'),
    hash: vi.fn().mockResolvedValue('new-hash'),
  }
  const service = new AuthService(prisma as any, passwords as any, { increment: vi.fn().mockResolvedValue(1) } as any)
  return { user, tx, prisma, passwords, service }
}

describe('AuthService atomic login concurrency', () => {
  it('keeps the two newest sessions at the default cap, revoking only this user’s excess sessions', async () => {
    vi.stubEnv('SESSION_MAX_CONCURRENT', '')
    const { service, tx, prisma } = transactionFixture()
    tx.session.findMany.mockResolvedValue([{ id: 'newest' }, { id: 'second' }, { id: 'oldest' }] as any)
    await expect(service.login('admin', 'Current-password-123!')).resolves.toHaveProperty('token')
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 1n, id: { in: ['oldest'] }, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(tx.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 1n,
          expiresAt: { gt: expect.any(Date) },
          lastSeenAt: { gt: expect.any(Date) },
        }),
      })
    )
    expect(tx.session.create).toHaveBeenCalledOnce()
    expect(tx.user.update).toHaveBeenCalledOnce()
  })
  it('does not revoke sessions below the cap', async () => {
    const { service, tx } = transactionFixture()
    await service.login('admin', 'Current-password-123!')
    expect(tx.session.updateMany).not.toHaveBeenCalled()
  })
  it.each(['0', '-1', 'NaN', '1.5', 'Infinity'])('falls back to cap three for invalid config %s', async (value) => {
    vi.stubEnv('SESSION_MAX_CONCURRENT', value)
    const { service, tx } = transactionFixture()
    tx.session.findMany.mockResolvedValue([{ id: 'one' }, { id: 'two' }, { id: 'three' }] as any)
    await service.login('admin', 'Current-password-123!')
    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['three'] } }) })
    )
  })
  it('honors a configured cap of one', async () => {
    vi.stubEnv('SESSION_MAX_CONCURRENT', '1')
    const { service, tx } = transactionFixture()
    tx.session.findMany.mockResolvedValue([{ id: 'previous' }] as any)
    await service.login('admin', 'Current-password-123!')
    expect(tx.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ id: { in: ['previous'] } }) })
    )
  })
  it.each([
    { passwordHash: 'reset-hash' },
    { status: 'DISABLED' },
    { mfaEnabled: true },
    { mfaSecret: 'rotated' },
    { lockedUntil: new Date(Date.now() + 60_000) },
  ])('rejects stale authentication state %j', async (changed) => {
    const { service, user, tx } = transactionFixture()
    tx.user.findUnique.mockResolvedValue({ ...user, ...changed })
    await expect(service.login('admin', 'Current-password-123!')).rejects.toThrow('账户状态已变更')
    expect(tx.session.create).not.toHaveBeenCalled()
  })
  it('retries serialization conflicts with a fresh transaction', async () => {
    const { service, prisma, tx } = transactionFixture()
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2034' })
    await service.login('admin', 'Current-password-123!')
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(tx.session.create).toHaveBeenCalledOnce()
  })
  it('bounds serialization retries', async () => {
    const { service, prisma } = transactionFixture()
    prisma.$transaction.mockRejectedValue({ code: 'P2034' })
    await expect(service.login('admin', 'Current-password-123!')).rejects.toThrow('并发登录冲突')
    expect(prisma.$transaction).toHaveBeenCalledTimes(3)
  })
})

describe('AuthService atomic password change', () => {
  it('runs history, password, session revocation and secret-free audit in one serializable transaction', async () => {
    const { service, tx, prisma } = transactionFixture()
    await expect(
      service.changePassword(1n, 'Current-password-123!', 'Next-password-123!', {
        traceId: 'server-trace',
        ip: '127.0.0.1',
        roleTypes: ['BUSINESS'],
      })
    ).resolves.toEqual({ expiresIn: 0 })
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      timeout: 20_000,
    })
    expect(tx.passwordHistory.create).toHaveBeenCalledOnce()
    expect(tx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { passwordHash: 'new-hash', passwordChangedAt: expect.any(Date) },
      })
    )
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 1n, revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          traceId: 'server-trace',
          ip: '127.0.0.1',
          actorId: 1n,
          action: 'auth.password.change',
          detail: {
            targetId: 'public-user-1',
            passwordChanged: true,
            sessionsRevoked: true,
            roleTypes: ['BUSINESS'],
          },
        }),
      })
    )
    const audit = JSON.stringify(tx.auditLog.create.mock.calls, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))
    expect(audit).not.toMatch(/password-123|old-hash|new-hash/)
  })
  it('does not write on incorrect current password', async () => {
    const { service, tx } = transactionFixture()
    await expect(service.changePassword(1n, 'wrong', 'Next-password-123!')).rejects.toThrow('原密码错误')
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.passwordHistory.create).not.toHaveBeenCalled()
  })
  it('does not write when a recent password change is observed', async () => {
    const { service, tx, user } = transactionFixture()
    tx.user.findUnique.mockResolvedValue({ ...user, passwordChangedAt: new Date() } as any)
    await expect(service.changePassword(1n, 'Current-password-123!', 'Next-password-123!')).rejects.toThrow('24 小时')
    expect(tx.user.update).not.toHaveBeenCalled()
  })
  it('propagates audit failure out of the transaction so the database rolls back', async () => {
    const { service, tx } = transactionFixture()
    tx.auditLog.create.mockRejectedValue(new Error('audit unavailable'))
    await expect(service.changePassword(1n, 'Current-password-123!', 'Next-password-123!')).rejects.toThrow('audit unavailable')
  })
  it('returns a conflict for concurrent changes instead of replaying the old credential', async () => {
    const { service, prisma } = transactionFixture()
    prisma.$transaction.mockRejectedValue({ code: 'P2034' })
    await expect(service.changePassword(1n, 'Current-password-123!', 'Next-password-123!')).rejects.toThrow('密码修改冲突')
    expect(prisma.$transaction).toHaveBeenCalledOnce()
  })
})
