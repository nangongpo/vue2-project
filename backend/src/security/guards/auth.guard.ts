import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common'
import { AuthService, PREAUTH_COOKIE, SESSION_COOKIE } from '../services/auth.service.js'
import { assertSameOrigin } from '../policies/csrf.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request)
    request.user = await this.auth.authenticate(request.cookies?.[SESSION_COOKIE])
    const route = request.routeOptions?.url || request.routerPath
    const enrollmentRoutes = new Set([
      '/api/v1/auth/logout',
      '/api/v1/auth/mfa/status',
      '/api/v1/auth/mfa/enroll',
      '/api/v1/auth/mfa/confirm',
      '/api/v1/auth/reauth',
    ])
    if (request.user.mfaRequired && (!request.user.mfaEnabled || !request.user.mfaVerifiedAt) && !enrollmentRoutes.has(route))
      throw new ForbiddenException('请先完成管理员多因素认证')
    return true
  }
}

@Injectable()
export class MfaAuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) assertSameOrigin(request)
    const formalToken = request.cookies?.[SESSION_COOKIE]
    const preAuthToken = request.cookies?.[PREAUTH_COOKIE]
    if (formalToken) {
      request.user = await this.auth.authenticate(formalToken)
      request.authToken = formalToken
      request.authCookie = SESSION_COOKIE
      return true
    }
    request.user = await this.auth.authenticate(preAuthToken)
    request.authToken = preAuthToken
    request.authCookie = PREAUTH_COOKIE
    return true
  }
}
