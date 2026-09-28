import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService, SESSION_COOKIE } from '#app/security/services/auth.service.js'
import { AuthenticatedUser } from '#app/security/types/auth.types.js'
import { REQUIRED_PERMISSIONS } from '#app/security/decorators/permission.decorator.js'
import { canonicalPath } from '#app/modules/permission/policies/policy.js'
import { hasRecentSecurityProof, resolveRiskDecision, securityStepUpException } from '#app/security/policies/risk-policy.js'
import { SECURITY_OPERATION } from '#app/security/decorators/operation.decorator.js'
import { OperationPolicyService } from '#app/security/services/operation-policy.service.js'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector = new Reflector(),
    private readonly auth?: AuthService,
    private readonly operationPolicies?: OperationPolicyService
  ) {}

  async canActivate(context: ExecutionContext) {
    const required =
      this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
        context.getHandler(),
        context.getClass(),
      ]) || []
    const operationCode = this.reflector.getAllAndOverride<string>(SECURITY_OPERATION, [context.getHandler(), context.getClass()])
    const request = context.switchToHttp().getRequest()
    const route = request.routeOptions?.url || request.routerPath
    const key = `${request.method} ${route}`
    // Only these handlers have a documented alternative boundary (public or self-owned).
    const exempt = new Set([
      'GET /api/v1/health',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/login/complete',
      'POST /api/v1/auth/logout',
      'GET /api/v1/auth/me',
      'GET /api/v1/auth/sessions',
      'GET /api/v1/auth/mfa/status',
      'DELETE /api/v1/auth/sessions/:id',
      'POST /api/v1/auth/password',
      'POST /api/v1/auth/mfa/enroll',
      'POST /api/v1/auth/mfa/confirm',
      'POST /api/v1/auth/reauth',
      'POST /api/v1/auth/session/renew',
      'POST /api/v1/captcha/challenges',
      'POST /api/v1/captcha/verify',
    ])
    if (!required.length && !operationCode) {
      if (exempt.has(key)) return true
      throw new ForbiddenException('接口未声明授权策略')
    }
    if (!request.user && this.auth) {
      request.user = await this.auth.authenticate(
        request.cookies?.[SESSION_COOKIE],
        'AUTHENTICATED'
      )
    }
    const permissions = request.user?.permissions || []
    if (!required.length) {
      if (!operationCode || !exempt.has(key)) throw new ForbiddenException('接口未声明授权策略')
      const decision = this.operationPolicies
        ? await this.operationPolicies.resolve(operationCode)
        : resolveRiskDecision(operationCode)
      request.operationCode = operationCode
      request.riskDecision = decision
      request.riskLevel = decision.riskLevel
      if (!hasRecentSecurityProof(request.user, decision.riskLevel)) throw securityStepUpException(request.user, decision)
      return true
    }
    if (!required.every((permission) => permissions.includes(permission)))
      throw new ForbiddenException('无权执行此操作')
    const matches =
      request.user?.apiPermissions?.filter(
        (permission: NonNullable<AuthenticatedUser['apiPermissions']>[number]) =>
          required.includes(permission.code) &&
          permission.method === request.method &&
          permission.path &&
          canonicalPath(permission.path) === canonicalPath(route || '')
      ) || []
    if (!matches.length) throw new ForbiddenException('请求方法或路由不匹配授权接口')
    if (request.user.mfaRequired && (!request.user.mfaEnabled || !request.user.mfaVerifiedAt))
      throw new ForbiddenException('管理员操作必须先完成多因素认证')
    const decision = operationCode && this.operationPolicies
      ? await this.operationPolicies.resolve(operationCode, required)
      : resolveRiskDecision(required[0])
    if (operationCode) request.operationCode = operationCode
    request.riskDecision = decision
    request.riskLevel = decision.riskLevel
    // Page metadata changes are classified by the target page in the permission
    // service (BUSINESS=L2, built-in/admin=L3). Keep that explicit target context
    // instead of replacing it with a fixed system.page.update baseline.
    if (!required.includes('system.page.update') && !hasRecentSecurityProof(request.user, decision.riskLevel))
      throw securityStepUpException(request.user, decision)
    return true
  }
}
