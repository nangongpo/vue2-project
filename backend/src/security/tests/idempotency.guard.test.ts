import { describe, expect, it, vi } from 'vitest'
import { IdempotencyGuard } from '../guards/idempotency.guard.js'

function context(redis: any, options: any) {
  const raw = { once: vi.fn() }
  const request = {
    method: 'POST',
    url: '/auth/login',
    routeOptions: { url: '/auth/login' },
    ip: '127.0.0.1',
    body: { username: 'admin' },
    headers: {},
  }
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ raw }) }),
    reflector: { getAllAndOverride: () => options },
  } as any
}

describe('IdempotencyGuard', () => {
  it('rejects a duplicate request while the lock is held', async () => {
    const redis = { acquireLock: vi.fn().mockResolvedValue(false), releaseLock: vi.fn() }
    const guard = new IdempotencyGuard(redis as any, { getAllAndOverride: () => ({ scope: 'auth.login' }) } as any)
    await expect(guard.canActivate(context(redis, { scope: 'auth.login' }))).rejects.toMatchObject({
      status: 409,
      response: { code: '100009' },
    })
    expect(redis.acquireLock).toHaveBeenCalledOnce()
  })

  it('registers response cleanup after acquiring a lock', async () => {
    const redis = { acquireLock: vi.fn().mockResolvedValue(true), releaseLock: vi.fn() }
    const guard = new IdempotencyGuard(redis as any, { getAllAndOverride: () => ({ scope: 'auth.login' }) } as any)
    const ctx = context(redis, { scope: 'auth.login' })
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(ctx.switchToHttp().getResponse().raw.once).toHaveBeenCalledWith('finish', expect.any(Function))
  })
})
