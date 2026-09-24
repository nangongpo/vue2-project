import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Observable, catchError, mergeMap } from 'rxjs'
import { AuditService } from '../services/audit.service.js'
import { sanitizeAuditRequest } from '../utils/audit-sanitizer.js'
import { Reflector } from '@nestjs/core'
import { AUDIT_ACTION } from '../decorators/audit.decorator.js'
import { REQUIRED_PERMISSIONS } from '../../security/decorators/permission.decorator.js'
import { SECURITY_OPERATION } from '../../security/decorators/operation.decorator.js'
import { resolveRiskLevel } from '../../security/policies/risk-policy.js'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name)

  constructor(private readonly audit: AuditService, private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest()
    const response = context.switchToHttp().getResponse()
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
    const permissions = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) || []
    const operationCode = request.operationCode || this.reflector.getAllAndOverride<string>(SECURITY_OPERATION, [context.getHandler(), context.getClass()])
    const riskLevel = request.riskLevel || resolveRiskLevel({ permissions, operation: action })
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
              roleTypes: request.user?.roles?.map((role: { roleType: string }) => role.roleType),
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
            statusCode: error.status || 500,
            detail: { request: requestDetail, error: { status: error.status || 500 } },
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
