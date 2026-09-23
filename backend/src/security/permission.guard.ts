import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthService, SESSION_COOKIE } from './auth.service.js'
import { REQUIRED_PERMISSIONS } from './permission.decorator.js'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector = new Reflector(),
    private readonly auth?: AuthService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [context.getHandler(), context.getClass()]) || []
    if (!required.length) return true
    const request = context.switchToHttp().getRequest()
    if (!request.user && this.auth) {
      request.user = await this.auth.authenticate(request.cookies?.[SESSION_COOKIE])
    }
    const permissions = request.user?.permissions || []
    if (!request.user?.isSuperAdmin && !required.every(permission => permissions.includes(permission))) throw new ForbiddenException('无权执行此操作')
    return true
  }
}
