import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { API_CODE, API_MESSAGE, API_TITLE, ApiCode } from './api-code.js'
import { AuditService } from '../audit/audit.service.js'
import { sanitizeAuditRequest } from '../audit/audit-sanitizer.js'

export function codeForStatus(status: number): ApiCode {
  if (status === HttpStatus.BAD_REQUEST) return API_CODE.INVALID_PARAMS
  if (status === HttpStatus.UNAUTHORIZED) return API_CODE.UNAUTHORIZED
  if (status === HttpStatus.FORBIDDEN) return API_CODE.FORBIDDEN
  if (status === HttpStatus.NOT_FOUND) return API_CODE.NOT_FOUND
  if (status === HttpStatus.CONFLICT) return API_CODE.CONFLICT
  if (status === HttpStatus.TOO_MANY_REQUESTS) return API_CODE.RATE_LIMITED
  return API_CODE.INTERNAL_ERROR
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  constructor(private readonly audit?: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>()
    const request = host.switchToHttp().getRequest<FastifyRequest & { traceId?: string; auditRecorded?: boolean; user?: { internalId?: bigint } }>()
    const databaseError = typeof exception === 'object' && exception !== null && 'code' in exception
      && /^P\d{4}$/.test(String((exception as { code?: unknown }).code))
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : databaseError ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.INTERNAL_SERVER_ERROR
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined
    const rawBody = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : {}
    const rawMessage = rawBody.message
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('；')
      : typeof rawMessage === 'string' ? rawMessage : API_MESSAGE[codeForStatus(status)]
    const code = typeof rawBody.code === 'string'
      ? rawBody.code
      : databaseError ? API_CODE.DATABASE_ERROR : codeForStatus(status)
    const safeMessage = databaseError ? API_MESSAGE[API_CODE.DATABASE_ERROR] : message

    // Do not fall back to the client-controlled header. Errors must carry the
    // server-generated id created by TraceIdInterceptor (or a fresh fallback).
    const traceId = request.traceId || randomUUID()
    response.header('X-Request-Trace-Id', traceId)
    if (!request.auditRecorded && this.audit && status >= HttpStatus.BAD_REQUEST) {
      request.auditRecorded = true
      void this.audit.record({
        traceId,
        actorId: request.user?.internalId,
        action: `${request.method} ${request.url.split('?')[0]}`,
        resource: request.url.split('?')[0],
        method: request.method,
        path: request.url.split('?')[0],
        result: 'FAILURE',
        statusCode: status,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
        detail: {
          request: sanitizeAuditRequest(request.query, request.body),
          error: { code, message: safeMessage },
        },
      }).catch(error => this.logger.error(`audit write failed: ${error.message}`))
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const errorMessage = exception instanceof Error ? exception.stack || exception.message : String(exception)
      this.logger.error(`[${traceId}] ${request.method} ${request.url}\n${errorMessage}`)
    }
    response
      .type('application/problem+json')
      .status(status)
      .send({
        type: `urn:vue2-project:problem:${code}`,
        title: API_TITLE[code as ApiCode] || '请求失败',
        status,
        detail: safeMessage,
        instance: request.url,
        code,
        traceId,
      })
  }
}
