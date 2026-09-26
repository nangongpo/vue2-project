import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, map } from 'rxjs'
import { isApiResponse } from '../http/api-response.js'
import { FIELD_SECURITY_RESOURCE } from '../decorators/field-security.decorator.js'
import { assertRecentSecurityProof, maxRiskLevel } from '../../security/policies/risk-policy.js'
import {
  assertButtonWritableFields,
  projectButton,
  projectButtons,
} from '../../security/policies/button-field-policy.js'

type FieldSecurityRequest = {
  method?: string
  url?: string
  body?: Record<string, unknown>
  user?: { permissions?: string[]; mfaVerifiedAt?: Date | null; reauthenticatedAt?: Date | null }
  fieldRiskLevel?: string
  riskLevel?: string
}

@Injectable()
export class FieldSecurityInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resource = this.reflector.getAllAndOverride<string>(FIELD_SECURITY_RESOURCE, [
      context.getHandler(),
      context.getClass(),
    ])
    const request = context.switchToHttp().getRequest<FieldSecurityRequest>()
    const permissionCodes = request.user?.permissions || []

    if (
      resource === 'button' &&
      (request.method === 'PATCH' || request.method === 'POST') &&
      request.body
    ) {
      const fieldInput = { ...request.body }
      delete fieldInput.functionId
      if (Object.prototype.hasOwnProperty.call(fieldInput, 'apiIds')) {
        fieldInput.apis = fieldInput.apiIds
        delete fieldInput.apiIds
      }
      const result = assertButtonWritableFields(fieldInput, permissionCodes)
      const riskLevel =
        request.method === 'POST' ? maxRiskLevel('L3', result.riskLevel) : result.riskLevel
      request.fieldRiskLevel = riskLevel
      request.riskLevel = riskLevel
      if (riskLevel === 'L2' || riskLevel === 'L3') {
        assertRecentSecurityProof(request.user || {}, riskLevel)
      }
    }

    return next.handle().pipe(
      map((value) => {
        if (resource !== 'button') return value
        const shouldProjectResponse =
          request.method === 'GET' ||
          (request.method === 'POST' && request.url?.endsWith('/buttons')) ||
          (request.method === 'PATCH' && /\/buttons\/[^/]+$/.test(request.url || ''))
        if (!shouldProjectResponse) return value
        const projectButtonValue = (item: unknown) =>
          item && typeof item === 'object'
            ? projectButton(item as Record<string, unknown>, permissionCodes)
            : item
        const projectPageValue = (item: unknown) => {
          if (!item || typeof item !== 'object') return item
          const page = item as Record<string, unknown>
          return Array.isArray(page.buttons)
            ? { ...page, buttons: projectButtons(page.buttons, permissionCodes) }
            : page
        }
        const project = request.url?.includes('/buttons') ? projectButtonValue : projectPageValue
        if (isApiResponse(value)) {
          if (Array.isArray(value.data)) return { ...value, data: value.data.map(project) }
          if (value.data && typeof value.data === 'object')
            return { ...value, data: project(value.data) }
          return value
        }
        if (Array.isArray(value)) return value.map(project)
        return project(value)
      })
    )
  }
}
