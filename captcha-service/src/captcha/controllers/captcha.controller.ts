import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import { ApiBody, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'

const protocolResponseSchema = {
  type: 'object',
  properties: {
    ApiVersion: { type: 'string', example: '1', description: 'API 版本。' },
    ProtocolVersion: { type: 'string', example: '1.0', description: '内部协议版本。' },
    RequestId: { type: 'string', format: 'uuid', description: '请求唯一 ID。' },
    Code: { type: 'string', example: 'SUCCESS', description: '业务结果码。' },
    Message: { type: 'string', example: 'success', description: '结果说明。' },
    Retryable: { type: 'boolean', example: false, description: '失败时是否建议调用方重试。' },
  },
  required: ['ApiVersion', 'ProtocolVersion', 'RequestId'],
}

const authProperties = {
  ApiVersion: { type: 'string', example: '1', description: 'API 版本。' },
  ProtocolVersion: { type: 'string', example: '1.0', description: '内部协议版本。' },
  ServiceId: { type: 'string', example: 'backend-admin', description: '调用方服务 ID。' },
  Timestamp: {
    type: 'integer',
    format: 'int64',
    example: 1770000000,
    description: 'Unix 时间戳，允许与服务端有少量时钟偏差。',
  },
  SignatureMethod: {
    type: 'string',
    example: 'HMAC-SHA256',
    description: '签名算法，固定为 HMAC-SHA256。',
  },
  SignatureVersion: { type: 'string', example: '1.0', description: '签名协议版本。' },
  SignatureNonce: {
    type: 'string',
    maxLength: 128,
    description: '一次性随机数，用于防止请求重放。',
  },
  Signature: { type: 'string', description: '按内部协议计算的 HMAC-SHA256 签名。' },
  SceneId: { type: 'string', example: 'login', description: '业务场景，目前固定为 login。' },
  AttemptId: { type: 'string', example: 'attempt_123', description: '本次验证码尝试 ID。' },
}

@Controller()
@ApiTags('验证码内部协议')
@ApiSecurity('service-auth')
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
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ...authProperties,
        Action: {
          type: 'string',
          enum: ['CreateChallenge'],
          example: 'CreateChallenge',
          description: '协议动作，必须与接口路径匹配。',
        },
        CaptchaType: {
          type: 'string',
          enum: ['SLIDER'],
          default: 'SLIDER',
          description: '验证码类型。',
        },
        Mode: {
          type: 'string',
          enum: ['EMBED', 'POPUP'],
          default: 'EMBED',
          description: '验证码展示模式。',
        },
        Subject: { type: 'string', maxLength: 64, description: '业务主体标识，例如用户名。' },
        ClientIp: { type: 'string', description: '调用方采集的客户端 IP。' },
        UserAgent: { type: 'string', description: '客户端 User-Agent。' },
        DeviceId: { type: 'string', description: '客户端设备标识。' },
      },
      required: [
        'ApiVersion',
        'ProtocolVersion',
        'ServiceId',
        'Timestamp',
        'SignatureMethod',
        'SignatureVersion',
        'SignatureNonce',
        'Signature',
        'Action',
        'SceneId',
        'AttemptId',
      ],
    },
  })
  @ApiResponse({ status: 200, schema: protocolResponseSchema })
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
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ...authProperties,
        Action: {
          type: 'string',
          enum: ['VerifyChallenge'],
          example: 'VerifyChallenge',
          description: '协议动作，必须与接口路径匹配。',
        },
        ChallengeId: { type: 'string', description: '待校验的验证码挑战 ID。' },
        Subject: {
          type: 'string',
          maxLength: 64,
          description: '业务主体标识，必须与创建挑战时一致。',
        },
        ClientIp: { type: 'string', description: '调用方采集的客户端 IP。' },
        UserAgent: { type: 'string', description: '客户端 User-Agent。' },
        DeviceId: { type: 'string', description: '客户端设备标识。' },
        Points: {
          type: 'array',
          minItems: 8,
          maxItems: 300,
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', description: '轨迹点横坐标。' },
              y: { type: 'number', description: '轨迹点纵坐标。' },
              t: { type: 'number', description: '轨迹点时间戳或相对时间。' },
            },
            required: ['x', 'y', 't'],
          },
        },
        FinalX: { type: 'number', description: '滑块最终横坐标。' },
        TrackWidth: { type: 'number', description: '客户端轨迹区域宽度。' },
      },
      required: [
        'ApiVersion',
        'ProtocolVersion',
        'ServiceId',
        'Timestamp',
        'SignatureMethod',
        'SignatureVersion',
        'SignatureNonce',
        'Signature',
        'Action',
        'SceneId',
        'AttemptId',
        'ChallengeId',
        'Points',
        'FinalX',
        'TrackWidth',
      ],
    },
  })
  @ApiResponse({ status: 200, schema: protocolResponseSchema })
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
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ...authProperties,
        Action: {
          type: 'string',
          enum: ['ConsumeToken'],
          example: 'ConsumeToken',
          description: '协议动作，必须与接口路径匹配。',
        },
        CaptchaToken: {
          type: 'string',
          maxLength: 256,
          description: '验证成功后签发的一次性令牌。',
        },
        Subject: { type: 'string', maxLength: 64, description: '业务主体标识。' },
        ClientIp: { type: 'string', description: '调用方采集的客户端 IP。' },
        DeviceId: { type: 'string', description: '客户端设备标识。' },
      },
      required: [
        'ApiVersion',
        'ProtocolVersion',
        'ServiceId',
        'Timestamp',
        'SignatureMethod',
        'SignatureVersion',
        'SignatureNonce',
        'Signature',
        'Action',
        'SceneId',
        'AttemptId',
        'CaptchaToken',
      ],
    },
  })
  @ApiResponse({ status: 200, schema: protocolResponseSchema })
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
