import { describe, expect, it, vi } from 'vitest'
import { AuthService } from './auth.service.js'

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: 'session-1',
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
    user: {
      id: 1n, userId: 'public-user-1', username: 'admin', displayName: '管理员', status: 'ACTIVE', failedLogins: 0,
      lastLoginAt: null, lastLoginIp: null, roles: [],
    },
    ...overrides,
  }
}

describe('AuthService session lifecycle', () => {
  it('revokes an idle session and rejects authentication', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const prisma = { session: { findUnique: vi.fn().mockResolvedValue(session({ lastSeenAt: new Date(Date.now() - 3_600_000) })), update } } as any
    const service = new AuthService(prisma, {} as any, { increment: vi.fn() } as any)
    process.env.SESSION_IDLE_TTL_SECONDS = '1800'

    await expect(service.authenticate('raw-token')).rejects.toThrow('闲置超时')
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { revokedAt: expect.any(Date) } }))
  })

  it('refreshes lastSeenAt for an active session', async () => {
    const update = vi.fn().mockResolvedValue(undefined)
    const prisma = { session: { findUnique: vi.fn().mockResolvedValue(session()), update } } as any
    const service = new AuthService(prisma, {} as any, { increment: vi.fn() } as any)

    await expect(service.authenticate('raw-token')).resolves.toMatchObject({ userId: 'public-user-1', internalId: 1n, username: 'admin' })
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastSeenAt: expect.any(Date) } }))
  })

  it('lists active sessions and marks the current session', async () => {
    const findMany = vi.fn().mockResolvedValue([session({ id: 'current-session' }), session({ id: 'other-session' })])
    const prisma = { session: { findMany } } as any
    const service = new AuthService(prisma, {} as any, { increment: vi.fn() } as any)
    vi.spyOn(service as any, 'hashToken').mockReturnValue('current-session')

    const result = await service.listSessions(1n, 'raw-token')

    expect(result.map(item => item.current)).toEqual([true, false])
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ userId: 1n, revokedAt: null }) }))
  })

  it('increments failed passwords atomically and locks at the configured limit', async () => {
    const user = { id: 'user-1', username: 'admin', passwordHash: 'hash', status: 'ACTIVE', failedLogins: 2, lockedUntil: null, roles: [] }
    const update = vi.fn()
      .mockResolvedValueOnce({ failedLogins: 3 })
      .mockResolvedValueOnce({})
    const prisma = { user: { findUnique: vi.fn().mockResolvedValue(user), update }, session: {} } as any
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
    const service = new AuthService(prisma, {} as any, {
      increment: vi.fn().mockResolvedValue(11),
      acquireLock: vi.fn().mockResolvedValue(true),
      releaseLock: vi.fn().mockResolvedValue(true),
    } as any)
    const originalLimit = process.env.LOGIN_RATE_LIMIT
    process.env.LOGIN_RATE_LIMIT = '10'

    await expect(service.login('admin', 'password', '127.0.0.1')).rejects.toThrow('登录请求过于频繁')
    expect(findUnique).not.toHaveBeenCalled()
    process.env.LOGIN_RATE_LIMIT = originalLimit
  })

})
