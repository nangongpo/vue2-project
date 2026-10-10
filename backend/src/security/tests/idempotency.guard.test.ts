import { describe, expect, it, vi } from 'vitest'
import type { ExecutionContext } from '@nestjs/common'
import { IdempotencyGuard } from '#app/security/guards/idempotency.guard.js'
import { getIdempotencyRoutePolicy, IdempotencyMode } from '#app/security/policies/idempotency-policy.js'

function context(path = '/api/v1/users') {
  const raw = { once: vi.fn() }
  const request = {
    method: 'POST',
    url: path,
    routeOptions: { url: path },
    ip: '127.0.0.1',
    body: { username: 'admin' },
    headers: { 'idempotency-key': 'test-idempotency-key-0001' },
  }
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ raw }) }),
  } as unknown as ExecutionContext
}

describe('IdempotencyGuard', () => {
  it('uses a short lock for login without enabling response replay', () => {
    expect(getIdempotencyRoutePolicy('POST', '/api/v1/auth/login')).toMatchObject({
      mode: IdempotencyMode.SHORT_LOCK,
    })
    expect(getIdempotencyRoutePolicy('POST', '/api/v1/auth/login/complete')).toMatchObject({
      mode: IdempotencyMode.SHORT_LOCK,
    })
  })

  it('uses full idempotency for business writes', () => {
    expect(getIdempotencyRoutePolicy('POST', '/api/v1/users')).toMatchObject({
      mode: IdempotencyMode.FULL,
    })
  })

  it('does not apply the generic guard to logout or file chunks', () => {
    expect(getIdempotencyRoutePolicy('POST', '/api/v1/auth/logout')).toBeNull()
    expect(getIdempotencyRoutePolicy('PUT', '/api/v1/files/uploads/u1/parts/1')).toBeNull()
  })

  it('rejects a duplicate request while the lock is held', async () => {
    const redis = { get: vi.fn().mockResolvedValue(null), setIfAbsent: vi.fn().mockResolvedValue(true), getAndDelete: vi.fn(), acquireLock: vi.fn().mockResolvedValue(false), releaseLock: vi.fn() }
    const guard = new IdempotencyGuard(redis as any)
    await expect(guard.canActivate(context())).rejects.toMatchObject({
      status: 409,
      response: { code: '100009' },
    })
    expect(redis.acquireLock).toHaveBeenCalledOnce()
  })

  it('registers response cleanup after acquiring a lock', async () => {
    const redis = { get: vi.fn().mockResolvedValue(null), setIfAbsent: vi.fn().mockResolvedValue(true), getAndDelete: vi.fn(), acquireLock: vi.fn().mockResolvedValue(true), releaseLock: vi.fn() }
    const guard = new IdempotencyGuard(redis as any)
    const ctx = context()
    await expect(guard.canActivate(ctx)).resolves.toBe(true)
    expect(ctx.switchToHttp().getResponse().raw.once).toHaveBeenCalledWith('finish', expect.any(Function))
  })
})
