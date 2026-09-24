import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
} from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { CaptchaEngine, CaptchaError, CaptchaPoint } from '../services/captcha.engine.js'
import { findBinding, loadBindings } from '../config/config.js'
import { requiredVersion, signRequest, signaturesMatch } from '../protocol/protocol.js'
import { RedisService } from '../services/redis.service.js'

@Controller()
export class CaptchaController {
  constructor(
    @Inject(CaptchaEngine) private readonly engine: CaptchaEngine,
    @Inject(RedisService) private readonly redis: RedisService
  ) {}

  @Get('health') health() {
    return { status: 'ok', service: 'captcha-service' }
  }

  @Get('ready') async ready() {
    if (!(await this.redis.ready())) throw new ServiceUnavailableException('Redis 未就绪')
    return { status: 'ok', service: 'captcha-service' }
  }

  @Post('internal/v1/challenges')
  create(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.run(
      'CreateChallenge',
      body,
      async (b) => {
        const binding = await this.auth(b)
        this.validate('CreateChallenge', b)
        return this.engine.createChallenge(binding, {
          attemptId: String(b.AttemptId),
          sceneId: String(b.SceneId),
          captchaType: b.CaptchaType as 'SLIDER' | undefined,
          mode: b.Mode as 'EMBED' | 'POPUP' | undefined,
          subject: String(b.Subject || ''),
          clientIp: String(b.ClientIp || req.ip || ''),
          userAgent: String(b.UserAgent || req.headers?.['user-agent'] || 'unknown'),
          deviceId: b.DeviceId ? String(b.DeviceId) : undefined,
        })
      },
      reply
    )
  }

  @Post('internal/v1/verify')
  verify(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.run(
      'VerifyChallenge',
      body,
      async (b) => {
        const binding = await this.auth(b)
        this.validate('VerifyChallenge', b)
        return this.engine.verifyChallenge(binding, {
          attemptId: String(b.AttemptId),
          challengeId: String(b.ChallengeId),
          sceneId: String(b.SceneId),
          subject: String(b.Subject || ''),
          clientIp: String(b.ClientIp || req.ip || ''),
          userAgent: String(b.UserAgent || req.headers?.['user-agent'] || 'unknown'),
          deviceId: b.DeviceId ? String(b.DeviceId) : undefined,
          points: b.Points as CaptchaPoint[],
          finalX: Number(b.FinalX),
          trackWidth: Number(b.TrackWidth),
        })
      },
      reply
    )
  }

  @Post('internal/v1/tokens/consume')
  consume(
    @Body() body: Record<string, unknown>,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply
  ) {
    return this.run(
      'ConsumeToken',
      body,
      async (b) => {
        const binding = await this.auth(b)
        this.validate('ConsumeToken', b)
        return {
          Valid: await this.engine.consumeToken(binding, {
            attemptId: String(b.AttemptId),
            token: String(b.CaptchaToken || ''),
            sceneId: String(b.SceneId),
            subject: String(b.Subject || ''),
            clientIp: String(b.ClientIp || req.ip || ''),
            deviceId: b.DeviceId ? String(b.DeviceId) : undefined,
          }),
        }
      },
      reply
    )
  }

  private async run(
    action: string,
    body: Record<string, unknown>,
    operation: (b: Record<string, unknown>) => Promise<Record<string, unknown>>,
    reply: FastifyReply
  ) {
    const requestId = String(body.RequestId || randomUUID())
    try {
      if (body.Action !== action) throw new CaptchaError('ACTION_PATH_MISMATCH', '操作与路径不匹配')
      const versionError = requiredVersion(body)
      if (versionError) throw new CaptchaError(versionError, '请求版本不支持')
      const result = await operation(body)
      reply.status(200)
      return { ApiVersion: '1', ProtocolVersion: '1.0', RequestId: requestId, ...result }
    } catch (e) {
      const error =
        e instanceof CaptchaError
          ? e
          : new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
      console.error(
        JSON.stringify({
          service: 'captcha-service',
          action,
          requestId,
          code: error.code,
          retryable: error.retryable,
          timestamp: new Date().toISOString(),
        })
      )
      reply.status(
        error.code === 'SERVICE_UNAVAILABLE' ? 503 : error.code === 'RATE_LIMITED' ? 429 : 400
      )
      return {
        ApiVersion: '1',
        ProtocolVersion: '1.0',
        RequestId: requestId,
        Code: error.code,
        Message: error.message,
        Retryable: error.retryable,
      }
    }
  }

  private validate(action: string, b: Record<string, unknown>) {
    const required = [
      'ServiceId',
      'SignatureMethod',
      'SignatureVersion',
      'SignatureNonce',
      'Signature',
      'SceneId',
      'AttemptId',
    ]
    for (const key of required)
      if (typeof b[key] !== 'string' || !String(b[key]).length || String(b[key]).length > 256)
        throw new CaptchaError('SERVICE_AUTH_FAILED', '服务认证失败')
    if (b.SceneId !== 'login' || !/^[A-Za-z0-9_-]{1,64}$/.test(String(b.AttemptId)))
      throw new CaptchaError('SCENE_NOT_FOUND', '业务场景不存在')
    if (action === 'CreateChallenge') {
      if (b.Subject !== undefined && String(b.Subject).length > 64)
        throw new CaptchaError('CONTEXT_MISMATCH', '请求参数无效')
      if (b.CaptchaType !== undefined && b.CaptchaType !== 'SLIDER')
        throw new CaptchaError('VERSION_UNSUPPORTED', '验证码类型暂不支持')
      if (b.Mode !== undefined && b.Mode !== 'EMBED' && b.Mode !== 'POPUP')
        throw new CaptchaError('SCENE_NOT_FOUND', '展示模式无效')
    } else if (action === 'VerifyChallenge') {
      if (
        typeof b.ChallengeId !== 'string' ||
        String(b.ChallengeId).length > 128 ||
        !Array.isArray(b.Points) ||
        b.Points.length < 8 ||
        b.Points.length > Number(process.env.CAPTCHA_MAX_TRACK_POINTS || 300) ||
        !Number.isFinite(Number(b.FinalX)) ||
        !Number.isFinite(Number(b.TrackWidth))
      )
        throw new CaptchaError('TRACK_INVALID', '请求轨迹无效')
    } else if (action === 'ConsumeToken') {
      if (
        typeof b.CaptchaToken !== 'string' ||
        !b.CaptchaToken.length ||
        String(b.CaptchaToken).length > 256
      )
        throw new CaptchaError('CHALLENGE_NOT_FOUND', '一次性令牌无效')
    }
  }

  private async auth(body: Record<string, unknown>) {
    const binding = findBinding(loadBindings(), String(body.ServiceId || ''))
    const timestamp = Number(body.Timestamp)
    if (
      Object.prototype.hasOwnProperty.call(body, 'Prefix') ||
      body.SignatureMethod !== 'HMAC-SHA256' ||
      body.SignatureVersion !== '1.0' ||
      !binding ||
      !body.Signature ||
      !Number.isFinite(timestamp) ||
      !body.SignatureNonce ||
      String(body.SignatureNonce).length > 128 ||
      Math.abs(Math.floor(Date.now() / 1000) - timestamp) > 300 ||
      !signaturesMatch(String(body.Signature), signRequest('POST', body, binding.secret))
    )
      throw new CaptchaError('SERVICE_AUTH_FAILED', '服务认证失败')
    const nonce = await this.redis.setOnce(
      `captcha:${process.env.NODE_ENV || 'development'}:${binding.prefix}:nonce:${String(
        body.SignatureNonce
      )}`,
      300
    )
    if (nonce === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (!nonce) throw new CaptchaError('SERVICE_AUTH_FAILED', '服务认证失败')
    return binding
  }
}
