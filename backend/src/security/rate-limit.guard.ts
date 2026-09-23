import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { FastifyRequest } from 'fastify'
import { RedisService } from '../cache/redis.service.js'

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<FastifyRequest>()
    const path = request.routeOptions.url || request.url.split('?')[0]
    if (path.endsWith('/health') || path.endsWith('/auth/login')) return true

    const limit = Number(process.env.API_RATE_LIMIT || 120)
    const windowSeconds = Number(process.env.API_RATE_WINDOW_SECONDS || 60)
    const identity = `${request.ip || 'unknown'}:${request.method}:${path}`
    const key = `security:api:${createHash('sha256').update(identity).digest('hex')}`
    const count = await this.redis.increment(key, windowSeconds)

    if (count !== null && count > limit) {
      throw new HttpException('请求过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
    return true
  }
}
