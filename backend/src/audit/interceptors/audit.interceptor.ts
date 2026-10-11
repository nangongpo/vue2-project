import { CallHandler, ExecutionContext, Injectable, NestInterceptor, ServiceUnavailableException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Observable, catchError, mergeMap } from 'rxjs'
import type { FastifyReply } from 'fastify'
import { AuditService } from '#app/audit/services/audit.service.js'
import type { AuditRequest } from '#app/audit/types.js'
import { sanitizeAuditDetail, sanitizeAuditRequest } from '#app/audit/utils/audit-sanitizer.js'
import { Reflector } from '@nestjs/core'
import { AUDIT_ACTION } from '#app/audit/decorators/audit.decorator.js'
import { SECURITY_OPERATION } from '#app/security/decorators/operation.decorator.js'
import { resolveRiskDecision } from '#app/security/policies/risk-policy.js'
import { normalizeAuditAction } from '#app/audit/utils/audit-action.js'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
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
    const operationCode = request.operationCode || this.reflector.getAllAndOverride<string>(SECURITY_OPERATION, [context.getHandler(), context.getClass()])
    const action = normalizeAuditAction({
      action: this.reflector.getAllAndOverride<string>(AUDIT_ACTION, [context.getHandler(), context.getClass()]),
      operationCode,
      method: request.method,
      path: resource,
    })
    const decision = request.riskDecision || (operationCode ? resolveRiskDecision(operationCode) : null)
    const riskLevel = request.riskLevel || decision?.riskLevel || 'L1'
    const requestDetail = sanitizeAuditRequest(request.query, request.body)
    const requestState = request as { auditRecorded?: boolean }
    const base = {
      traceId,
      tenantId: request.user?.tenantId || '',
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
              response: sanitizeAuditDetail(value),
              roleTypes: request.user?.roles?.map((role) => role.roleType),
              riskDecision: decision,
            },
          })
        } catch {
          // 审计是安全控制面的一部分；写入失败时拒绝返回业务成功结果。
          throw new ServiceUnavailableException('审计服务不可用，操作未确认完成')
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
              response: sanitizeAuditDetail(
                typeof error === 'object' && error !== null && 'response' in error
                  ? (error as { response?: unknown }).response
                  : { status: error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500 }
              ),
              riskDecision: decision,
              error: {
                status: error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500,
              },
            },
          })
        } catch {
          // 原始失败也不能掩盖审计故障，调用方必须重试或转人工处置。
          throw new ServiceUnavailableException('审计服务不可用，操作结果需人工核查')
        }
        requestState.auditRecorded = true
        throw error
      })
    )
  }
}
