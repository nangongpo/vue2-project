import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Observable, catchError, tap, throwError } from 'rxjs'
import { AuditService } from './audit.service.js'
import { sanitizeAuditRequest } from './audit-sanitizer.js'
import { Reflector } from '@nestjs/core'
import { AUDIT_ACTION } from './audit.decorator.js'

@Injectable()
export class AuditInterceptor implements NestInterceptor {
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
    const action = this.reflector.getAllAndOverride<string>(AUDIT_ACTION, [context.getHandler(), context.getClass()]) || `${request.method} ${resource}`
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
      tap(() => {
        requestState.auditRecorded = true
        void this.audit.record({ ...base, result: 'SUCCESS', statusCode: response.statusCode, detail: { request: requestDetail } }).catch(error => console.error('audit write failed', error))
      }),
      catchError(error => {
        requestState.auditRecorded = true
        void this.audit.record({
          ...base,
          result: 'FAILURE',
          statusCode: error.status || 500,
          detail: { request: requestDetail, error: { code: error.code, message: error.message } },
        }).catch(auditError => console.error('audit write failed', auditError))
        return throwError(() => error)
      }),
    )
  }
}
