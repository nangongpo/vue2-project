import { BadRequestException, CanActivate, ConflictException, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { FastifyRequest } from 'fastify'
import { API_CODE } from '#app/common/constants/api-code.js'
import { RedisService } from '#app/cache/services/redis.service.js'
import { getIdempotencyRoutePolicy, IdempotencyMode } from '#app/security/policies/idempotency-policy.js'

type LockRequest = FastifyRequest & {
  idempotencyLock?: { key: string; value: string }
  idempotencyCacheKey?: string
  idempotencyFingerprintKey?: string
  idempotencyReplay?: unknown
  idempotencyReplayStatus?: number
  user?: { internalId?: bigint; activeTenantId?: string; tenantId?: string }
}

const KEY_PATTERN = /^[A-Za-z0-9._:-]{16,128}$/

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<LockRequest>()
    const response = context.switchToHttp().getResponse<{ raw?: { once: (event: string, listener: () => void) => void } }>()
    const path = request.routeOptions?.url || request.url.split('?')[0]
    const policy = getIdempotencyRoutePolicy(request.method, path)
    if (!policy) return true
    const clientKey = this.header(request.headers['idempotency-key'])
    if (!clientKey || !KEY_PATTERN.test(clientKey)) {
      throw new BadRequestException('缺少或无效的 Idempotency-Key')
    }
    // 指纹用于阻止同一 Key 被替换成另一份请求，不能仅依赖客户端是否重复发送。
    const requestFingerprint = stableStringify(request.body || {})
    const principal = request.user?.internalId?.toString() || `anonymous:${request.ip || 'unknown'}`
    const tenant = request.user?.activeTenantId || request.user?.tenantId || 'none'
    const identity = `${request.method}:${path}:${principal}:${tenant}:${clientKey}`
    const digest = createHash('sha256').update(identity).digest('hex')
    const key = `security:idempotency:${digest}`
    const fingerprintKey = `${key}:fingerprint`
    const existingFingerprint = await this.redis.get(fingerprintKey)
    if (existingFingerprint && existingFingerprint !== requestFingerprint) {
      throw new ConflictException({ code: API_CODE.CONFLICT, message: 'Idempotency-Key 已绑定其他请求' })
    }
    if (!existingFingerprint) {
      const claimed = await this.redis.setIfAbsent(
        fingerprintKey,
        requestFingerprint,
        policy.fingerprintTtlSeconds,
      )
      if (claimed === null) {
        throw new HttpException({ code: API_CODE.INTERNAL_ERROR, message: '请求幂等服务暂不可用' }, HttpStatus.SERVICE_UNAVAILABLE)
      }
      if (!claimed) {
        const racedFingerprint = await this.redis.get(fingerprintKey)
        if (racedFingerprint !== requestFingerprint) {
          throw new ConflictException({ code: API_CODE.CONFLICT, message: 'Idempotency-Key 已绑定其他请求' })
        }
      }
    }
    // 只有完整模式允许响应重放；认证类短锁永远跳过这一步，避免重放 Cookie 或一次性因子。
    const cached = policy.mode === IdempotencyMode.FULL ? await this.redis.get(`${key}:response`) : null
    if (policy.mode === IdempotencyMode.FULL && cached) {
      try {
        const replay = JSON.parse(cached) as { status?: unknown; payload?: unknown }
        if (!replay || typeof replay !== 'object' || replay.payload === undefined) throw new Error('invalid idempotency response')
        request.idempotencyReplay = replay.payload
        request.idempotencyReplayStatus = typeof replay.status === 'number' ? replay.status : 200
        return true
      } catch {
        await this.redis.getAndDelete(`${key}:response`)
      }
    }
    const value = randomUUID()
    // 短锁和完整模式都需要互斥执行；区别在于完整模式会由响应拦截器继续保存成功响应。
    const ttl = Number(process.env.IDEMPOTENCY_LOCK_SECONDS || 15)
    const acquired = await this.redis.acquireLock(key, value, ttl)

    if (acquired === null) {
      throw new HttpException({ code: API_CODE.INTERNAL_ERROR, message: '请求幂等服务暂不可用' }, HttpStatus.SERVICE_UNAVAILABLE)
    }
    if (!acquired) {
      throw new ConflictException({ code: API_CODE.REQUEST_IN_PROGRESS, message: '请求处理中，请勿重复提交' })
    }

    request.idempotencyLock = { key, value }
    request.idempotencyCacheKey = policy.mode === IdempotencyMode.FULL ? key : undefined
    request.idempotencyFingerprintKey = fingerprintKey
    let released = false
    const release = () => {
      if (released) return
      released = true
      void this.redis.releaseLock(key, value)
      if (policy.mode === IdempotencyMode.SHORT_LOCK) void this.redis.getAndDelete(fingerprintKey)
    }
    response.raw?.once('finish', release)
    response.raw?.once('close', release)
    return true
  }

  private header(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
  }
}
