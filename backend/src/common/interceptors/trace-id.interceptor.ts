import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { Observable } from 'rxjs'

type TracedRequest = FastifyRequest & { traceId?: string }

@Injectable()
export class TraceIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<TracedRequest>()
    const response = context.switchToHttp().getResponse<FastifyReply>()
    // Never trust a client-controlled value as the server's correlation id.
    // A fresh id prevents log correlation spoofing and cross-request confusion.
    const traceId = randomUUID()

    request.traceId = traceId
    response.header('X-Request-Trace-Id', traceId)
    return next.handle()
  }
}
