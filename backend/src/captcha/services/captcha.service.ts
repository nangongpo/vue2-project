import { createHmac, randomUUID } from 'node:crypto'
import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { API_CODE } from '../../common/constants/api-code.js'
import { RedisService } from '../../cache/services/redis.service.js'
export type CaptchaPoint = { x: number; y: number; t: number }
export type CaptchaEvent =
  | 'INIT_SUCCESS'
  | 'INIT_FAILURE'
  | 'RESOURCE_LOAD_FAILURE'
  | 'VERIFY_SUCCESS'
  | 'VERIFY_FAILURE'
  | 'TOKEN_CONSUME_SUCCESS'
  | 'TOKEN_CONSUME_FAILURE'
type Attempt = {
  username: string
  scene: 'login'
  challengeId?: string
  tokenHash?: string
  expiresAt: number
}
const encode = (v: string) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const value = (input: unknown) =>
  Array.isArray(input) || (input !== null && typeof input === 'object') ? JSON.stringify(input) : String(input)
function sign(body: Record<string, unknown>, secret: string) {
  const canonical = Object.keys(body)
    .filter((k) => k !== 'Signature' && body[k] !== undefined)
    .sort()
    .map((k) => `${encode(k)}=${encode(value(body[k]))}`)
    .join('&')
  return createHmac('sha256', `${secret}&`)
    .update(`POST&%2F&${encode(canonical)}`)
    .digest('base64')
}

@Injectable()
export class CaptchaService {
  constructor(private readonly redis: RedisService) {}
  private readonly baseUrl = (process.env.CAPTCHA_SERVICE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '')
  private readonly timeout = Number(process.env.CAPTCHA_SERVICE_TIMEOUT_MS || 2000)
  private common(action: string, attemptId: string) {
    return {
      ApiVersion: '1',
      ProtocolVersion: '1.0',
      RequestId: randomUUID(),
      ServiceId: process.env.CAPTCHA_SERVICE_ID || 'backend-admin',
      Action: action,
      Timestamp: String(Math.floor(Date.now() / 1000)),
      SignatureMethod: 'HMAC-SHA256',
      SignatureVersion: '1.0',
      SignatureNonce: randomUUID(),
      SceneId: 'login',
      AttemptId: attemptId,
    }
  }
  private normalizeUsername(username: string) {
    return username.trim()
  }
  private attemptKey(id: string) {
    return `security:captcha:attempt:${id}`
  }
  private async readAttempt(attemptId: string) {
    const raw = await this.redis.get(this.attemptKey(attemptId))
    if (!raw) throw new ServiceUnavailableException('验证码流程已失效')
    try {
      const attempt = JSON.parse(raw) as Attempt
      if (attempt.expiresAt < Date.now()) throw new Error('expired')
      return attempt
    } catch {
      throw new ServiceUnavailableException('验证码流程已失效')
    }
  }
  async createChallenge(username: string, ip?: string, userAgent?: string) {
    const normalized = this.normalizeUsername(username)
    const attemptId = randomUUID()
    const ttl = Number(process.env.CAPTCHA_CHALLENGE_TTL || 120)
    const attempt: Attempt = {
      username: normalized,
      scene: 'login',
      expiresAt: Date.now() + ttl * 1000,
    }
    if (!(await this.redis.set(this.attemptKey(attemptId), JSON.stringify(attempt), ttl)))
      throw new ServiceUnavailableException('验证码服务暂不可用')
    try {
      const result = await this.request<Record<string, unknown>>('/internal/v1/challenges', {
        ...this.common('CreateChallenge', attemptId),
        Subject: normalized,
        ClientIp: ip || 'unknown',
        UserAgent: userAgent || 'unknown',
      })
      const updated = { ...attempt, challengeId: String(result.ChallengeId) }
      await this.redis.set(this.attemptKey(attemptId), JSON.stringify(updated), ttl)
      return {
        attemptId,
        challengeId: result.ChallengeId,
        sceneId: 'login',
        captchaType: result.CaptchaType,
        mode: result.Mode,
        typeVersion: result.TypeVersion,
        resourceVersion: result.ResourceVersion,
        expiresIn: result.ExpiresIn,
        payload: result.Payload,
      }
    } catch (error) {
      await this.redis.getAndDelete(this.attemptKey(attemptId))
      throw error
    }
  }
  async verifyChallenge(input: {
    attemptId: string
    challengeId: string
    ip?: string
    userAgent?: string
    points: CaptchaPoint[]
    finalX: number
    trackWidth: number
  }) {
    const attempt = await this.readAttempt(input.attemptId)
    if (attempt.challengeId !== input.challengeId)
      throw new HttpException({ code: API_CODE.CAPTCHA_INVALID, message: '验证码流程无效' }, 400)
    const body = {
      ...this.common('VerifyChallenge', input.attemptId),
      ChallengeId: input.challengeId,
      Subject: attempt.username,
      ClientIp: input.ip || 'unknown',
      UserAgent: input.userAgent || 'unknown',
      Points: input.points,
      FinalX: input.finalX,
      TrackWidth: input.trackWidth,
    }
    const result = await this.request<Record<string, unknown>>('/internal/v1/verify', body)
    const token = String(result.CaptchaToken || '')
    const updated: Attempt = {
      ...attempt,
      tokenHash: createHmac('sha256', 'attempt-token').update(token).digest('hex'),
    }
    await this.redis.set(this.attemptKey(input.attemptId), JSON.stringify(updated), Math.max(30, Number(result.ExpiresIn || 120)))
    return {
      attemptId: input.attemptId,
      verified: result.Verified === true,
      captchaToken: token,
      expiresIn: result.ExpiresIn,
    }
  }
  async consumeToken(token: string | undefined, attemptId: string | undefined, username: string, ip?: string) {
    if (!token || !attemptId) return false
    const attempt = await this.readAttempt(attemptId)
    if (attempt.username !== this.normalizeUsername(username) || !attempt.tokenHash) return false
    const tokenHash = createHmac('sha256', 'attempt-token').update(token).digest('hex')
    if (tokenHash !== attempt.tokenHash) return false
    try {
      const result = await this.request<{ Valid?: boolean }>('/internal/v1/tokens/consume', {
        ...this.common('ConsumeToken', attemptId),
        CaptchaToken: token,
        Subject: attempt.username,
        ClientIp: ip || 'unknown',
      })
      if (result.Valid === true) await this.redis.getAndDelete(this.attemptKey(attemptId))
      return result.Valid === true
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() < 500) return false
      throw error
    }
  }
  async reportEvent(input: { event: CaptchaEvent; attemptId?: string; challengeId?: string; durationMs?: number; reason?: string }) {
    const attemptId = input.attemptId || randomUUID()
    const body = {
      ...this.common('ReportEvent', attemptId),
      EventId: randomUUID(),
      Event: input.event,
      ChallengeId: input.challengeId,
      DurationMs: input.durationMs,
      Reason: input.reason,
    }
    const result = await this.request<{ Accepted?: boolean }>('/internal/v1/events', body)
    return { accepted: result.Accepted === true }
  }
  private async request<T = Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
    const secret = process.env.CAPTCHA_SERVICE_SECRET
    if (!secret) throw new ServiceUnavailableException('验证码服务密钥未配置')
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const controller = new AbortController()
      timer = setTimeout(() => controller.abort(), this.timeout)
      const signedBody: Record<string, unknown> = { ...body, Signature: sign(body, secret) }
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(signedBody),
        signal: controller.signal,
      })
      const payload = (await response.json()) as {
        Code?: string
        Message?: string
        [key: string]: unknown
      }
      if (payload.RequestId !== undefined && payload.RequestId !== signedBody.RequestId) {
        throw new ServiceUnavailableException('验证码服务请求链路异常')
      }
      if (!response.ok || payload.Code) {
        const unavailable = payload.Code === 'SERVICE_UNAVAILABLE'
        const status = response.status >= 500 || unavailable ? 503 : 400
        const code =
          payload.Code === 'RATE_LIMITED' ? API_CODE.RATE_LIMITED : status >= 500 ? API_CODE.INTERNAL_ERROR : API_CODE.CAPTCHA_INVALID
        throw new HttpException({ code, message: payload.Message || '验证码服务校验失败' }, status)
      }
      return payload as T
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(
        JSON.stringify({
          service: 'backend',
          dependency: 'captcha-service',
          path,
          requestId: body.RequestId,
          error: error instanceof Error ? error.message : String(error),
        })
      )
      throw new ServiceUnavailableException('验证码服务暂不可用')
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}
