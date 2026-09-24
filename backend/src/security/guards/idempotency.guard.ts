import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { createHash, randomUUID } from 'node:crypto'
import { FastifyRequest } from 'fastify'
import { API_CODE } from '../../common/constants/api-code.js'
import { RedisService } from '../../cache/services/redis.service.js'
import { IDEMPOTENCY_OPTIONS, IdempotencyOptions } from '../decorators/idempotency.decorator.js'

type LockRequest = FastifyRequest & { idempotencyLock?: { key: string; value: string } }

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(private readonly redis: RedisService, private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext) {
    const options = this.reflector.getAllAndOverride<IdempotencyOptions>(IDEMPOTENCY_OPTIONS, [context.getHandler(), context.getClass()])
    if (!options) return true

    const request = context.switchToHttp().getRequest<LockRequest>()
    const response = context.switchToHttp().getResponse<{ raw?: { once: (event: string, listener: () => void) => void } }>()
    const path = request.routeOptions.url || request.url.split('?')[0]
    const clientKey = this.header(request.headers['idempotency-key'])
    const requestFingerprint = clientKey || JSON.stringify(request.body || {})
    const identity = `${options.scope || `${request.method}:${path}`}:${request.ip || 'unknown'}:${requestFingerprint}`
    const key = `security:idempotency:${createHash('sha256').update(identity).digest('hex')}`
    const value = randomUUID()
    const ttl = options.ttlSeconds || Number(process.env.IDEMPOTENCY_LOCK_SECONDS || 15)
    const acquired = await this.redis.acquireLock(key, value, ttl)

    if (acquired === null) {
      throw new HttpException({ code: API_CODE.INTERNAL_ERROR, message: '请求幂等服务暂不可用' }, HttpStatus.SERVICE_UNAVAILABLE)
    }
    if (!acquired) {
      throw new HttpException({ code: API_CODE.REQUEST_IN_PROGRESS, message: '请求处理中，请勿重复提交' }, HttpStatus.CONFLICT)
    }

    request.idempotencyLock = { key, value }
    let released = false
    const release = () => {
      if (released) return
      released = true
      void this.redis.releaseLock(key, value)
    }
    response.raw?.once('finish', release)
    response.raw?.once('close', release)
    return true
  }

  private header(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value
  }
}
