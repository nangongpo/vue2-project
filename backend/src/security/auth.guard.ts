import { CanActivate, ExecutionContext, Inject, Injectable } from '@nestjs/common'
import { AuthService, SESSION_COOKIE } from './auth.service.js'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    request.user = await this.auth.authenticate(request.cookies?.[SESSION_COOKIE])
    return true
  }
}
