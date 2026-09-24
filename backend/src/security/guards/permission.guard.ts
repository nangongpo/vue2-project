import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService, SESSION_COOKIE } from '../services/auth.service.js'
import { AuthenticatedUser } from '../types/auth.types.js'
import { REQUIRED_PERMISSIONS } from '../decorators/permission.decorator.js'
import { canonicalPath } from '../../modules/permission/policies/policy.js'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector = new Reflector(), private readonly auth?: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) || []
    const request = context.switchToHttp().getRequest()
    const route = request.routeOptions?.url || request.routerPath
    const key = `${request.method} ${route}`
    // Only these handlers have a documented alternative boundary (public or self-owned).
    const exempt = new Set([
      'GET /api/v1/health',
      'POST /api/v1/auth/login',
      'POST /api/v1/auth/logout',
      'GET /api/v1/auth/me',
      'GET /api/v1/auth/sessions',
      'GET /api/v1/auth/mfa/status',
      'DELETE /api/v1/auth/sessions/:id',
      'POST /api/v1/auth/password',
      'POST /api/v1/auth/mfa/enroll',
      'POST /api/v1/auth/mfa/confirm',
      'POST /api/v1/auth/reauth',
      'POST /api/v1/captcha/challenges',
      'POST /api/v1/captcha/verify',
      'POST /api/v1/captcha/events',
    ])
    if (!required.length) {
      if (exempt.has(key)) return true
      throw new ForbiddenException('接口未声明授权策略')
    }
    if (!request.user && this.auth) {
      request.user = await this.auth.authenticate(request.cookies?.[SESSION_COOKIE])
    }
    const permissions = request.user?.permissions || []
    if (!required.every((permission) => permissions.includes(permission))) throw new ForbiddenException('无权执行此操作')
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
    return true
  }
}
