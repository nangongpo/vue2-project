import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { encodeBase32, MfaService, totpAtStep } from '../services/mfa.service.js'

function decodeBase32(encoded: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let value = 0,
    bits = 0
  const bytes: number[] = []
  for (const char of encoded) {
    value = (value << 5) | alphabet.indexOf(char)
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

function fixture() {
  const user = {
    id: 7n,
    username: 'alice',
    passwordHash: 'hash',
    status: 'ACTIVE',
    expiresAt: null as Date | null,
    lockedUntil: null,
    mfaEnabled: false,
    mfaSecret: null as string | null,
    mfaLastStep: null as bigint | null,
  }
  const pending = new Map<string, string>()
  const redis = {
    increment: vi.fn().mockResolvedValue(1),
    set: vi.fn(async (key, value) => {
      pending.set(key, value)
      return true
    }),
    get: vi.fn(async (key) => pending.get(key) || null),
  }
  const passwords = { verify: vi.fn().mockResolvedValue(true) }
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({ ...user })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (where.mfaLastStep !== undefined && where.mfaLastStep !== user.mfaLastStep) return { count: 0 }
        if (where.mfaEnabled !== undefined && where.mfaEnabled !== user.mfaEnabled) return { count: 0 }
        Object.assign(user, data)
        return { count: 1 }
      }),
    },
    session: {
      findFirst: vi.fn().mockResolvedValue({ id: 'session' }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: vi.fn(async (fn: any) => fn(prisma)),
  }
  const service = new MfaService(prisma as any, passwords as any, redis as any)
  const code = (secret: string, offset = 0n) => totpAtStep(decodeBase32(secret), BigInt(Math.floor(Date.now() / 30000)) + offset)
  const enroll = () => service.enroll(7n, 'password', 'raw-token')
  const enable = async () => {
    const result = await enroll()
    await service.confirm(7n, code(result.secret), 'raw-token')
    vi.advanceTimersByTime(30000)
    return result
  }
  return { user, pending, redis, passwords, prisma, service, code, enroll, enable }
}

describe('RFC 6238 primitives', () => {
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('matches the SHA1 reference vector at %s seconds', (seconds, expected) => {
    expect(totpAtStep(Buffer.from('12345678901234567890'), BigInt(Math.floor(Number(seconds) / 30)), 8)).toBe(expected)
  })
  it('encodes the authenticator secret as unpadded RFC 4648 base32', () => {
    expect(encodeBase32(Buffer.from('foobar'))).toBe('MZXW6YTBOI')
  })
})

describe('MFA service', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.stubEnv('MFA_ENCRYPTION_KEY', Buffer.alloc(32, 11).toString('base64'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('requires password proof, stores only encrypted pending material, and enables only after proof', async () => {
    const f = fixture()
    const result = await f.enroll()
    expect(f.passwords.verify).toHaveBeenCalledWith('password', 'hash')
    expect(result.secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(result.uri).toContain(`secret=${result.secret}`)
    expect(result.uri).toContain('period=30')
    expect(f.redis.set).toHaveBeenCalledWith(expect.any(String), expect.stringMatching(/^v1\./), 600)
    expect([...f.pending.values()][0]).not.toContain(result.secret)
    expect(f.user.mfaEnabled).toBe(false)
    const confirmed = await f.service.confirm(7n, f.code(result.secret), 'raw-token')
    expect(confirmed.mfaEnabled).toBe(true)
    expect(f.user.mfaEnabled).toBe(true)
    expect(f.prisma.session.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: createHash('sha256').update('raw-token').digest('hex'),
        userId: 7n,
        revokedAt: null,
      }),
      data: { mfaVerifiedAt: new Date(), reauthenticatedAt: new Date() },
    })
    await expect(f.service.verify(7n, f.code(result.secret))).rejects.toThrow('已使用')
  })

  it('rejects incorrect passwords without generating enrollment material', async () => {
    const f = fixture()
    f.passwords.verify.mockResolvedValue(false)
    await expect(f.enroll()).rejects.toThrow('密码验证失败')
    expect(f.redis.set).not.toHaveBeenCalled()
  })

  it('binds pending enrollment to the session and rejects expired enrollment', async () => {
    const f = fixture()
    const result = await f.enroll()
    await expect(f.service.confirm(7n, f.code(result.secret), 'other-token')).rejects.toThrow('绑定已过期')
    f.pending.clear()
    await expect(f.service.confirm(7n, f.code(result.secret), 'raw-token')).rejects.toThrow('绑定已过期')
    expect(f.user.mfaEnabled).toBe(false)
  })

  it('does not allow replacing an enabled authenticator', async () => {
    const f = fixture()
    await f.enable()
    await expect(f.enroll()).rejects.toThrow('已启用')
  })

  it('rejects invalid keys and authentication-tag tampering', async () => {
    const f = fixture()
    vi.stubEnv('MFA_ENCRYPTION_KEY', 'invalid')
    await expect(f.enroll()).rejects.toThrow('配置不可用')
    vi.stubEnv('MFA_ENCRYPTION_KEY', Buffer.alloc(32, 11).toString('base64'))
    const result = await f.enable()
    const parts = f.user.mfaSecret!.split('.')
    parts[2] = Buffer.alloc(16).toString('base64')
    f.user.mfaSecret = parts.join('.')
    await expect(f.service.verify(7n, f.code(result.secret))).rejects.toThrow('配置不可用')
  })

  it('rejects copying an encrypted secret to another user', async () => {
    const f = fixture()
    const result = await f.enable()
    await expect(f.service.verify(8n, f.code(result.secret))).rejects.toThrow('配置不可用')
  })

  it('enforces a one-step clock tolerance and rejects malformed codes', async () => {
    const f = fixture()
    const result = await f.enable()
    await expect(f.service.verify(7n, '12345')).rejects.toThrow('无效')
    await expect(f.service.verify(7n, f.code(result.secret, 2n))).rejects.toThrow('无效')
    await f.service.verify(7n, f.code(result.secret, 1n))
    await expect(f.service.verify(7n, f.code(result.secret))).rejects.toThrow('已使用')
  })

  it('allows only one concurrent use of a valid code', async () => {
    const f = fixture()
    const result = await f.enable()
    const outcomes = await Promise.allSettled([f.service.verify(7n, f.code(result.secret)), f.service.verify(7n, f.code(result.secret))])
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((item) => item.status === 'rejected')).toHaveLength(1)
  })

  it('fails closed when rate limiting is unavailable or exhausted', async () => {
    const f = fixture()
    f.redis.increment.mockResolvedValue(null)
    await expect(f.enroll()).rejects.toThrow('限频服务不可用')
    expect(f.passwords.verify).not.toHaveBeenCalled()
    f.redis.increment.mockResolvedValue(6)
    await expect(f.service.verify(7n, '123456')).rejects.toThrow('过于频繁')
  })

  it('requires both factors to reauthenticate MFA users and never persists the raw token', async () => {
    const f = fixture()
    const result = await f.enable()
    f.prisma.session.updateMany.mockClear()
    await expect(f.service.reauthenticate(7n, 'password', undefined, 'raw-token')).rejects.toThrow('无效')
    expect(f.prisma.session.updateMany).not.toHaveBeenCalled()
    await f.service.reauthenticate(7n, 'password', f.code(result.secret), 'raw-token')
    expect(f.prisma.session.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: createHash('sha256').update('raw-token').digest('hex'),
        userId: 7n,
      }),
      data: { mfaVerifiedAt: new Date(), reauthenticatedAt: new Date() },
    })
  })

  it('does not mark password-only sessions MFA verified and rejects revoked sessions', async () => {
    const f = fixture()
    await f.service.reauthenticate(7n, 'password', undefined, 'raw-token')
    expect(f.prisma.session.updateMany.mock.calls[0][0].data).toEqual({
      reauthenticatedAt: new Date(),
    })
    f.prisma.session.updateMany.mockResolvedValue({ count: 0 })
    await expect(f.service.reauthenticate(7n, 'password', undefined, 'raw-token')).rejects.toThrow('已失效')
  })

  it('rejects disabled and expired accounts', async () => {
    const f = fixture()
    f.user.status = 'DISABLED'
    await expect(f.enroll()).rejects.toThrow('账号不可用')
    f.user.status = 'ACTIVE'
    f.user.expiresAt = new Date(Date.now() - 1)
    await expect(f.service.reauthenticate(7n, 'password', undefined, 'raw-token')).rejects.toThrow('账号不可用')
  })
})
