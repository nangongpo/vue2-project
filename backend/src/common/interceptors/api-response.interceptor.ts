import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { FastifyReply } from 'fastify'
import { map, Observable } from 'rxjs'
import { isApiResponse, successResponse } from '../http/api-response.js'

@Injectable()
export class ApiResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<FastifyReply>()
    return next.handle().pipe(
      map((value: unknown) => {
        // A 204 response must remain bodyless. All other successful values use
        // the same public envelope unless the handler already supplied it.
        if (response.statusCode === 204 || isApiResponse(value)) return value
        return successResponse(value ?? null)
      })
    )
  }
}
