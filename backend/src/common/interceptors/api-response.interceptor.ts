import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { from, map, Observable, switchMap } from 'rxjs'
import { isApiResponse, successResponse } from '#app/common/http/api-response.js'
import { RedisService } from '#app/cache/services/redis.service.js'

type IdempotencyRequest = {
  idempotencyReplay?: unknown
  idempotencyReplayStatus?: number
  idempotencyCacheKey?: string
}

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  constructor(private readonly redis?: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<FastifyReply>()
    const request = context.switchToHttp().getRequest<IdempotencyRequest>()
    if (request.idempotencyReplay !== undefined) {
      if (request.idempotencyReplayStatus) response.status(request.idempotencyReplayStatus)
      return from([request.idempotencyReplay])
    }
    return next.handle().pipe(
      switchMap((value: unknown) => {
        if (value instanceof StreamableFile) return from([value])
        // A 204 response must remain bodyless. All other successful values use
        // the same public envelope unless the handler already supplied it.
        const payload = response.statusCode === 204 || isApiResponse(value) ? value : successResponse(value ?? null)
        if (!request.idempotencyCacheKey || !this.redis || response.statusCode < 200 || response.statusCode >= 300) return from([payload])
        return from(this.redis.set(`${request.idempotencyCacheKey}:response`, JSON.stringify({ status: response.statusCode, payload }), 900)).pipe(map(() => payload))
      })
    )
  }
}
