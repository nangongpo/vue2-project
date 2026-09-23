import { afterEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'
import { CaptchaService } from './captcha.service.js'

const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const expectedSignature = (body: Record<string, unknown>, secret: string) => {
  const canonical = Object.keys(body).filter(key => key !== 'Signature' && body[key] !== undefined).sort().map(key => `${encode(key)}=${encode(String(body[key]))}`).join('&')
  return createHmac('sha256', `${secret}&`).update(`POST&%2F&${encode(canonical)}`).digest('base64')
}

describe('CaptchaService HTTP client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('delegates challenge creation to the isolated captcha service', async () => {
    process.env.CAPTCHA_SERVICE_SECRET = 'x'.repeat(32)
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ChallengeId: 'challenge-1', ExpiresIn: 300, Payload: {} }),
    })
    vi.stubGlobal('fetch', fetch)

    const redis = { set: vi.fn().mockResolvedValue(true), get: vi.fn().mockResolvedValue(null), getAndDelete: vi.fn().mockResolvedValue(null) } as any
    const result = await new CaptchaService(redis).createChallenge('admin', '127.0.0.1', 'Chrome')

    expect(result).toMatchObject({ attemptId: expect.any(String), challengeId: 'challenge-1', expiresIn: 300, payload: {} })
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/internal/v1/challenges'), expect.objectContaining({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    }))
    const requestBody = JSON.parse(fetch.mock.calls[0][1].body as string) as Record<string, unknown>
    expect(requestBody.Signature).toBe(expectedSignature(requestBody, 'x'.repeat(32)))
  })

  it('returns false when the isolated service rejects a token', async () => {
    process.env.CAPTCHA_SERVICE_SECRET = 'x'.repeat(32)
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ Code: 'ANSWER_INVALID', Message: 'invalid captcha' }),
    })
    vi.stubGlobal('fetch', fetch)

    const redis = { set: vi.fn().mockResolvedValue(true), get: vi.fn().mockResolvedValue(JSON.stringify({ username: 'admin', tokenHash: 'not-this-token', expiresAt: Date.now() + 1000 })), getAndDelete: vi.fn().mockResolvedValue(null) } as any
    await expect(new CaptchaService(redis).consumeToken('token', 'attempt-1', 'admin', '127.0.0.1')).resolves.toBe(false)
  })

  it('maps internal event response to a public acknowledgement', async () => {
    process.env.CAPTCHA_SERVICE_SECRET = 'x'.repeat(32)
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ApiVersion: '1', ProtocolVersion: '1.0', Accepted: true }),
    })
    vi.stubGlobal('fetch', fetch)
    const result = await new CaptchaService({} as any).reportEvent({ event: 'VERIFY_SUCCESS', attemptId: 'attempt-1' })
    expect(result).toEqual({ accepted: true })
    expect(result).not.toHaveProperty('RequestId')
  })
})
