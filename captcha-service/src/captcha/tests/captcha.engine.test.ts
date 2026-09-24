import { describe, expect, it } from 'vitest'
import { CaptchaEngine, ServiceBinding } from '../services/captcha.engine.js'
class MemoryRedis {
  values = new Map<string, string>()
  async increment() {
    return 1
  }
  async set(k: string, v: string) {
    this.values.set(k, v)
    return true
  }
  async get(k: string) {
    return this.values.get(k) || null
  }
  async getAndDelete(k: string) {
    const v = this.values.get(k) || null
    this.values.delete(k)
    return v
  }
  async incrementJsonField(k: string, field: string, max: number) {
    const raw = this.values.get(k)
    if (!raw) return -1
    const value = JSON.parse(raw) as Record<string, number>
    const next = Number(value[field] || 0) + 1
    if (next >= max) this.values.delete(k)
    else this.values.set(k, JSON.stringify({ ...value, [field]: next }))
    return next
  }
}
const binding: ServiceBinding = {
  serviceId: 'backend-admin',
  secret: 'secret',
  prefix: 'yaxbgo',
  status: 'ACTIVE',
  scenes: {
    login: {
      allowedCaptchaTypes: ['SLIDER'],
      defaultCaptchaType: 'SLIDER',
      allowedModes: ['POPUP'],
      defaultMode: 'POPUP',
      ttl: 120,
      status: 'ACTIVE',
    },
  },
}
describe('CaptchaEngine', () => {
  it('generates resources and consumes a successful token once', async () => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const c = await engine.createChallenge(binding, {
      attemptId: 'attempt-1',
      sceneId: 'login',
      subject: 'admin',
      clientIp: '127.0.0.1',
      userAgent: 'Chrome',
    })
    expect(c.Payload.backgroundImage).toMatch(/^data:image\/svg\+xml;base64,/)
    const stored = JSON.parse([...redis.values.values()][1] || [...redis.values.values()][0]) as {
      targetX: number
    }
    const points = Array.from({ length: 11 }, (_, i) => ({
      x: Math.round((stored.targetX * i) / 10),
      y: 20,
      t: i * 100,
    }))
    const result = await engine.verifyChallenge(binding, {
      attemptId: 'attempt-1',
      challengeId: c.ChallengeId,
      sceneId: 'login',
      subject: 'admin',
      clientIp: '127.0.0.1',
      userAgent: 'Chrome',
      points,
      finalX: stored.targetX,
      trackWidth: c.Payload.trackWidth,
    })
    expect(
      await engine.consumeToken(binding, {
        attemptId: 'attempt-1',
        token: result.CaptchaToken,
        sceneId: 'login',
        subject: 'admin',
        clientIp: '127.0.0.1',
      })
    ).toBe(true)
    expect(
      await engine.consumeToken(binding, {
        attemptId: 'attempt-1',
        token: result.CaptchaToken,
        sceneId: 'login',
        subject: 'admin',
        clientIp: '127.0.0.1',
      })
    ).toBe(false)
  })

  it('keeps a challenge for limited answer retries', async () => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const c = await engine.createChallenge(binding, {
      attemptId: 'attempt-retry',
      sceneId: 'login',
      subject: 'admin',
      clientIp: '127.0.0.2',
      userAgent: 'Chrome',
    })
    const stored = JSON.parse([...redis.values.values()][1] || [...redis.values.values()][0]) as {
      targetX: number
    }
    const invalidInput = {
      attemptId: 'attempt-retry',
      challengeId: c.ChallengeId,
      sceneId: 'login' as const,
      subject: 'admin',
      clientIp: '127.0.0.2',
      userAgent: 'Chrome',
      points: Array.from({ length: 11 }, (_, i) => ({ x: i, y: 20, t: i * 100 })),
      finalX: stored.targetX + 100,
      trackWidth: c.Payload.trackWidth,
    }
    await expect(engine.verifyChallenge(binding, invalidInput)).rejects.toMatchObject({
      code: 'ANSWER_INVALID',
    })
    expect([...redis.values.values()].some((value) => value.includes('verifyAttempts'))).toBe(true)
  })
})
