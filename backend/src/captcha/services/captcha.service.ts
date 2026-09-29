import { createHash, createHmac, randomUUID } from 'node:crypto'
import { HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common'
import { API_CODE } from '#app/common/constants/api-code.js'
import { RedisService } from '#app/cache/services/redis.service.js'
import { AuditService } from '#app/audit/services/audit.service.js'
export type CaptchaPoint = { x: number; y: number; t: number }
type Attempt = {
  username: string
  scene: 'login'
  challengeId?: string
  tokenHash?: string
  expiresAt: number
}
const encode = (v: string) =>
  encodeURIComponent(v).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const value = (input: unknown) =>
  Array.isArray(input) || (input !== null && typeof input === 'object')
    ? JSON.stringify(input)
    : String(input)
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
  constructor(private readonly redis: RedisService, private readonly audit?: AuditService) {}
  private readonly baseUrl = (process.env.CAPTCHA_SERVICE_URL || 'http://127.0.0.1:3100').replace(
    /\/$/,
    ''
  )
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
      TraceId: randomUUID(),
      SceneId: 'login',
      AttemptId: attemptId,
    }
  }
  private normalizeUsername(username: string) {
    return username.trim()
  }
  private auditHash(value: unknown) {
    return createHash('sha256')
      .update(`${process.env.CAPTCHA_LOG_HASH_SECRET || 'captcha-log-hash-v1'}:${String(value || '')}`)
      .digest('hex')
      .slice(0, 32)
  }
  private maskIp(value?: string) {
    if (!value) return undefined
    if (value.includes(':')) return `${value.split(':').slice(0, 3).join(':')}:*`
    const parts = value.split('.')
    return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.*` : '[MASKED]'
  }
  private operationCode(path: string, payload: Record<string, unknown>, result: 'SUCCESS' | 'FAILURE') {
    if (result === 'FAILURE') {
      return payload.Code === 'RATE_LIMITED'
        ? 'captcha.rate_limited'
        : payload.Code === 'SERVICE_AUTH_FAILED'
          ? 'captcha.service_auth_failed'
        : payload.Code === 'SERVICE_UNAVAILABLE'
            ? 'captcha.redis_unavailable'
            : path.endsWith('/verify') && ['ANSWER_INVALID', 'TRACK_INVALID', 'CHALLENGE_EXPIRED', 'CHALLENGE_NOT_FOUND', 'CONTEXT_MISMATCH'].includes(String(payload.Code || ''))
              ? 'captcha.verify.failed'
            : 'captcha.protocol_rejected'
    }
    if (path.endsWith('/challenges')) return 'captcha.challenge.created'
    if (path.endsWith('/verify')) return payload.Verified === true ? 'captcha.verify.success' : 'captcha.verify.failed'
    return payload.Valid === true ? 'captcha.token.consumed' : 'captcha.verify.failed'
  }
  private async auditEvent(input: {
    path: string
    body: Record<string, unknown>
    payload: Record<string, unknown>
    result: 'SUCCESS' | 'FAILURE'
    statusCode: number
    durationMs: number
  }) {
    if (!this.audit) return
    const requestId = String(input.body.RequestId || '')
    const operationCode = this.operationCode(input.path, input.payload, input.result)
    try {
      await this.audit.record({
        traceId: this.auditHash(String(input.body.TraceId || requestId)),
        action: operationCode,
        operationCode,
        riskLevel: 'L1',
        resource: 'captcha-service',
        method: 'INTERNAL',
        path: input.path,
        result: input.result,
        statusCode: input.statusCode,
        ip: this.maskIp(typeof input.body.ClientIp === 'string' ? input.body.ClientIp : undefined),
        detail: {
          service: 'captcha-service',
          instance: process.env.CAPTCHA_INSTANCE_ID || process.env.HOSTNAME || 'unknown',
          environment: process.env.NODE_ENV || 'development',
          action: String(input.body.Action || ''),
          code: input.payload.Code || 'SUCCESS',
          requestId: requestId ? this.auditHash(requestId) : undefined,
          attemptId: input.body.AttemptId ? this.auditHash(input.body.AttemptId) : undefined,
          subjectHash: input.body.Subject ? this.auditHash(input.body.Subject) : undefined,
          durationMs: input.durationMs,
          rateLimited: input.payload.Code === 'RATE_LIMITED',
          dependency: input.payload.Code === 'SERVICE_UNAVAILABLE' ? 'captcha-service-or-redis' : undefined,
        },
      })
    } catch (error) {
      console.error(JSON.stringify({
        service: 'backend',
        operationCode: 'audit.write.failed',
        dependency: 'database',
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }
  private attemptKey(id: string) {
    return `security:captcha:attempt:${id}`
  }
  private async rateLimit(scope: string, identity: string, envName: string, fallback: number) {
    const limit = Number(process.env[envName] || fallback)
    const windowSeconds = Number(process.env.CAPTCHA_RATE_WINDOW_SECONDS || 60)
    const key = `security:captcha:rate:${scope}:${createHash('sha256')
      .update(identity)
      .digest('hex')}`
    const count = await this.redis.increment(key, windowSeconds)
    if (count === null) throw new ServiceUnavailableException('验证码限频服务不可用')
    if (count > limit) throw new HttpException('验证码请求过于频繁，请稍后重试', 429)
  }
  private async readAttempt(attemptId: string) {
    const raw = await this.redis.get(this.attemptKey(attemptId))
    if (!raw)
      throw new HttpException(
        { code: API_CODE.CAPTCHA_INVALID, message: '验证码流程已失效，请重新获取验证码' },
        400
      )
    try {
      const attempt = JSON.parse(raw) as Attempt
      if (attempt.expiresAt < Date.now()) throw new Error('expired')
      return attempt
    } catch {
      throw new HttpException(
        { code: API_CODE.CAPTCHA_INVALID, message: '验证码流程已失效，请重新获取验证码' },
        400
      )
    }
  }
  async createChallenge(username: string, ip?: string, userAgent?: string) {
    const normalized = this.normalizeUsername(username)
    await this.rateLimit('challenge-ip', ip || 'unknown', 'CAPTCHA_CHALLENGE_RATE_LIMIT', 10)
    await this.rateLimit(
      'challenge-user',
      normalized.toLowerCase(),
      'CAPTCHA_CHALLENGE_RATE_LIMIT',
      10
    )
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
    await this.rateLimit('verify-ip', input.ip || 'unknown', 'CAPTCHA_VERIFY_RATE_LIMIT', 30)
    await this.rateLimit('verify-attempt', input.attemptId, 'CAPTCHA_VERIFY_RATE_LIMIT', 30)
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
    await this.redis.set(
      this.attemptKey(input.attemptId),
      JSON.stringify(updated),
      Math.max(30, Number(result.ExpiresIn || 120))
    )
    return {
      attemptId: input.attemptId,
      verified: result.Verified === true,
      captchaToken: token,
      expiresIn: result.ExpiresIn,
    }
  }
  async consumeToken(
    token: string | undefined,
    attemptId: string | undefined,
    username: string,
    ip?: string
  ) {
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
  private async request<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown>
  ): Promise<T> {
    const secret = process.env.CAPTCHA_SERVICE_SECRET
    if (!secret) throw new ServiceUnavailableException('验证码服务密钥未配置')
    let timer: ReturnType<typeof setTimeout> | undefined
    const startedAt = Date.now()
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
          payload.Code === 'RATE_LIMITED'
            ? API_CODE.RATE_LIMITED
            : status >= 500
            ? API_CODE.INTERNAL_ERROR
            : API_CODE.CAPTCHA_INVALID
        await this.auditEvent({ path, body, payload, result: 'FAILURE', statusCode: status, durationMs: Date.now() - startedAt })
        throw new HttpException({ code, message: payload.Message || '验证码服务校验失败' }, status)
      }
      const eventResult = this.operationCode(path, payload, 'SUCCESS').endsWith('.failed') ? 'FAILURE' : 'SUCCESS'
      await this.auditEvent({ path, body, payload, result: eventResult, statusCode: response.status, durationMs: Date.now() - startedAt })
      return payload as T
    } catch (error) {
      if (error instanceof HttpException) throw error
      await this.auditEvent({
        path,
        body,
        payload: { Code: 'SERVICE_UNAVAILABLE' },
        result: 'FAILURE',
        statusCode: 503,
        durationMs: Date.now() - startedAt,
      })
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
