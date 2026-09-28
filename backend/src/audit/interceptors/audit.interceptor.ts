import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Observable, catchError, mergeMap } from 'rxjs'
import type { FastifyReply } from 'fastify'
import { AuditService } from '#app/audit/services/audit.service.js'
import type { AuditRequest } from '#app/audit/types.js'
import { sanitizeAuditRequest } from '#app/audit/utils/audit-sanitizer.js'
import { Reflector } from '@nestjs/core'
import { AUDIT_ACTION } from '#app/audit/decorators/audit.decorator.js'
import { SECURITY_OPERATION } from '#app/security/decorators/operation.decorator.js'
import { resolveRiskDecision } from '#app/security/policies/risk-policy.js'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name)

  constructor(private readonly audit: AuditService, private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditRequest>()
    const response = context.switchToHttp().getResponse<FastifyReply>()
    // The global trace interceptor creates the authoritative server-side id.
    // Keep a defensive fallback for non-standard test/adaptor contexts, but
    // never replace it with a client-provided header.
    const traceId = request.traceId || randomUUID()
    request.traceId = traceId
    response.header('X-Request-Trace-Id', traceId)
    const path = request.url.split('?')[0]
    const resource = request.routeOptions?.url || request.routerPath || path
    const action =
      this.reflector.getAllAndOverride<string>(AUDIT_ACTION, [context.getHandler(), context.getClass()]) || `${request.method} ${resource}`
    const operationCode = request.operationCode || this.reflector.getAllAndOverride<string>(SECURITY_OPERATION, [context.getHandler(), context.getClass()])
    const decision = request.riskDecision || (operationCode ? resolveRiskDecision(operationCode) : null)
    const riskLevel = request.riskLevel || decision?.riskLevel || 'L1'
    const requestDetail = sanitizeAuditRequest(request.query, request.body)
    const requestState = request as { auditRecorded?: boolean }
    const base = {
      traceId,
      actorId: request.user?.internalId,
      action,
      resource,
      method: request.method,
      path,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    }
    return next.handle().pipe(
      mergeMap(async (value) => {
        try {
          await this.audit.record({
            ...base,
            operationCode,
            riskLevel,
            result: 'SUCCESS',
            statusCode: response.statusCode,
            detail: {
              request: requestDetail,
              roleTypes: request.user?.roles?.map((role) => role.roleType),
              riskDecision: decision,
            },
          })
        } catch (error) {
          this.logger.error(`audit write failed for ${traceId}`, error)
        }
        requestState.auditRecorded = true
        return value
      }),
      catchError(async (error) => {
        try {
          await this.audit.record({
            ...base,
            operationCode,
            riskLevel,
            result: 'FAILURE',
            statusCode: error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500,
            detail: {
              request: requestDetail,
              riskDecision: decision,
              error: {
                status: error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500,
              },
            },
          })
        } catch (auditError) {
          this.logger.error(`audit write failed for ${traceId}`, auditError)
        }
        requestState.auditRecorded = true
        throw error
      })
    )
  }
}
