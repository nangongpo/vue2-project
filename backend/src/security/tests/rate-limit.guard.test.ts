import { describe, expect, it, vi } from 'vitest'
import { HttpException } from '@nestjs/common'
import { RateLimitGuard } from '../guards/rate-limit.guard.js'

function context(path: string, ip = '127.0.0.1') {
  const request = { ip, method: 'POST', url: path, routeOptions: { url: path } }
  return { switchToHttp: () => ({ getRequest: () => request }) } as any
}

describe('RateLimitGuard', () => {
  it('skips health and login endpoints', async () => {
    const redis = { increment: vi.fn(async () => 121) } as any
    const guard = new RateLimitGuard(redis)

    await expect(guard.canActivate(context('/api/v1/health'))).resolves.toBe(true)
    await expect(guard.canActivate(context('/api/v1/auth/login'))).resolves.toBe(true)
    expect(redis.increment).not.toHaveBeenCalled()
  })

  it('allows requests under the configured limit', async () => {
    const redis = { increment: vi.fn(async () => 1) } as any
    const guard = new RateLimitGuard(redis)

    await expect(guard.canActivate(context('/api/v1/users'))).resolves.toBe(true)
    expect(redis.increment).toHaveBeenCalledOnce()
  })

  it('rejects requests above the configured limit', async () => {
    const redis = { increment: vi.fn(async () => 121) } as any
    const guard = new RateLimitGuard(redis)

    await expect(guard.canActivate(context('/api/v1/users'))).rejects.toMatchObject(new HttpException('请求过于频繁，请稍后重试', 429))
  })
})
