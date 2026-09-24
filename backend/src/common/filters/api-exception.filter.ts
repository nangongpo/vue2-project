import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { FastifyReply, FastifyRequest } from 'fastify'
import { API_CODE, API_MESSAGE, API_TITLE, ApiCode } from '../constants/api-code.js'
import { ApiResponse } from '../http/api-response.js'
import { AuditService } from '../../audit/services/audit.service.js'
import { sanitizeAuditRequest } from '../../audit/utils/audit-sanitizer.js'
import { resolveRiskLevel, type RiskLevel } from '../../security/policies/risk-policy.js'

export function codeForStatus(status: number): ApiCode {
  if (status === HttpStatus.BAD_REQUEST) return API_CODE.INVALID_PARAMS
  if (status === HttpStatus.UNAUTHORIZED) return API_CODE.UNAUTHORIZED
  if (status === HttpStatus.FORBIDDEN) return API_CODE.FORBIDDEN
  if (status === HttpStatus.NOT_FOUND) return API_CODE.NOT_FOUND
  if (status === HttpStatus.CONFLICT) return API_CODE.CONFLICT
  if (status === HttpStatus.TOO_MANY_REQUESTS) return API_CODE.RATE_LIMITED
  if (status === HttpStatus.SERVICE_UNAVAILABLE) return API_CODE.SERVICE_UNAVAILABLE
  return API_CODE.INTERNAL_ERROR
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name)

  constructor(private readonly audit?: AuditService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<FastifyReply>()
    const request = host.switchToHttp().getRequest<
      FastifyRequest & {
        traceId?: string
        auditRecorded?: boolean
        riskLevel?: RiskLevel
        operationCode?: string
        user?: { internalId?: bigint }
      }
      >()
    const databaseError =
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      /^P\d{4}$/.test(String((exception as { code?: unknown }).code))
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : databaseError
        ? HttpStatus.SERVICE_UNAVAILABLE
        : HttpStatus.INTERNAL_SERVER_ERROR
    const raw = exception instanceof HttpException ? exception.getResponse() : undefined
    const rawBody = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
    const rawMessage = rawBody.message
    const message = Array.isArray(rawMessage)
      ? rawMessage.join('；')
      : typeof rawMessage === 'string'
      ? rawMessage
      : API_MESSAGE[codeForStatus(status)]
    let code = typeof rawBody.code === 'string' ? rawBody.code : databaseError ? API_CODE.DATABASE_ERROR : codeForStatus(status)
    if (databaseError) code = API_CODE.DATABASE_ERROR
    else if (status === HttpStatus.SERVICE_UNAVAILABLE) code = API_CODE.SERVICE_UNAVAILABLE
    const apiCode: ApiCode = Object.values(API_CODE).includes(code as ApiCode) ? (code as ApiCode) : API_CODE.INTERNAL_ERROR
    const safeMessage = status >= HttpStatus.INTERNAL_SERVER_ERROR ? API_MESSAGE[apiCode] : databaseError ? API_MESSAGE[API_CODE.DATABASE_ERROR] : message
    const rawData = rawBody.data && typeof rawBody.data === 'object' && !Array.isArray(rawBody.data)
      ? (rawBody.data as Record<string, unknown>)
      : {}

    // Do not fall back to the client-controlled header. Errors must carry the
    // server-generated id created by TraceIdInterceptor (or a fresh fallback).
    const traceId = request.traceId || randomUUID()
    response.header('X-Request-Trace-Id', traceId)
    if (!request.auditRecorded && this.audit && status >= HttpStatus.BAD_REQUEST) {
      request.auditRecorded = true
      void this.audit
        .record({
          traceId,
          actorId: request.user?.internalId,
          operationCode: request.operationCode,
          action: `${request.method} ${request.url.split('?')[0]}`,
          riskLevel: request.riskLevel || resolveRiskLevel({ operation: `${request.method} ${request.url.split('?')[0]}` }),
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
        })
        .catch((error) => this.logger.error(`audit write failed: ${error.message}`))
    }
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const errorMessage = exception instanceof Error ? exception.stack || exception.message : String(exception)
      this.logger.error(`[${traceId}] ${request.method} ${request.url}\n${errorMessage}`)
    }
    const errorData = {
      traceId,
      status,
      ...(Array.isArray(rawMessage) ? { details: rawMessage } : {}),
      ...(apiCode === API_CODE.SECURITY_STEP_UP_REQUIRED
        ? {
            riskLevel: rawData.riskLevel,
            operationCode: rawData.operationCode,
            requiredFactors: rawData.requiredFactors,
          }
        : {}),
    }
    const payload: ApiResponse<typeof errorData> = {
      code: apiCode,
      message: safeMessage || API_TITLE[apiCode] || '请求失败',
      data: errorData,
    }
    response.type('application/json').status(status).send(payload)
  }
}
