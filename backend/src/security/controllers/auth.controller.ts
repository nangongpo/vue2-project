import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { FastifyReply, FastifyRequest } from 'fastify'
import {
  AuthService,
  PREAUTH_COOKIE,
  SESSION_COOKIE,
  preAuthCookieOptions,
  sessionCookieOptions,
} from '../services/auth.service.js'
import { AuthGuard } from '../guards/auth.guard.js'
import { API_CODE } from '../../common/constants/api-code.js'
import { AuditAction } from '../../audit/decorators/audit.decorator.js'
import { Idempotent } from '../decorators/idempotency.decorator.js'
import { assertSameOrigin } from '../policies/csrf.js'
import { SecurityOperation } from '../decorators/operation.decorator.js'

class LoginDto {
  /** 登录账号。 */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string

  /** 密码。 */
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string

  /** backend 验证码校验令牌。 */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  captchaToken?: string

  /** 验证码挑战尝试 ID。 */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  attemptId?: string
}

class ChangePasswordDto {
  /** 当前密码。 */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string

  /** 新密码，至少 12 位。 */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string
}

class CompleteLoginDto {
  /** MFA 一次性验证码，6 位数字。 */
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string
}

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Idempotent({ scope: 'auth.login' })
  @AuditAction('auth.login')
  async login(@Body() body: LoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    assertSameOrigin(request)
    const result = await this.auth.login(
      body.username,
      body.password,
      request.ip,
      request.headers['user-agent'],
      body.captchaToken,
      body.attemptId
    )
    if (result.nextStep) {
      response.clearCookie(SESSION_COOKIE, sessionCookieOptions())
      response.setCookie(PREAUTH_COOKIE, result.token, preAuthCookieOptions(result.expiresIn))
      const code = result.nextStep === 'MFA_ENROLL_REQUIRED' ? API_CODE.MFA_ENROLL_REQUIRED : API_CODE.MFA_REQUIRED
      return {
        code,
        message: '需要继续验证',
        data: {
          mfaRequired: Boolean(result.user.mfaRequired),
          mfaEnabled: Boolean(result.user.mfaEnabled),
          mfaVerifiedAt: null,
          reauthenticatedAt: null,
        },
      }
    }
    response.clearCookie(PREAUTH_COOKIE, preAuthCookieOptions())
    response.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresIn))
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  @Post('login/complete')
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.login.complete')
  async completeLogin(@Body() body: CompleteLoginDto, @Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    assertSameOrigin(request)
    const result = await this.auth.completeLogin(request.cookies?.[PREAUTH_COOKIE], body.otp)
    response.clearCookie(PREAUTH_COOKIE, preAuthCookieOptions())
    response.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresIn))
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  @Post('logout')
  @AuditAction('auth.logout')
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    assertSameOrigin(request)
    await Promise.all([
      this.auth.logout(request.cookies?.[SESSION_COOKIE]),
      this.auth.logout(request.cookies?.[PREAUTH_COOKIE]),
    ])
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions())
    response.clearCookie(PREAUTH_COOKIE, preAuthCookieOptions())
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  @Get('sessions')
  @UseGuards(AuthGuard)
  @AuditAction('auth.sessions.list')
  sessions(@Req() request: FastifyRequest) {
    const user = (request as FastifyRequest & { user: { internalId: bigint } }).user
    return this.auth
      .listSessions(user.internalId, request.cookies?.[SESSION_COOKIE])
      .then((data) => ({ code: API_CODE.SUCCESS, message: 'success', data }))
  }

  @Delete('sessions/:id')
  @UseGuards(AuthGuard)
  @SecurityOperation('system.session.revoke')
  @AuditAction('auth.sessions.revoke')
  async revokeSession(@Req() request: FastifyRequest, @Param('id') sessionId: string) {
    assertSameOrigin(request)
    const user = (request as FastifyRequest & { user: { internalId: bigint } }).user
    await this.auth.revokeSession(user.internalId, sessionId)
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @AuditAction('auth.me')
  me(@Req() request: FastifyRequest) {
    const user = (
      request as FastifyRequest & {
        user: Record<string, unknown> & { internalId?: string; isSuperAdmin?: boolean }
      }
    ).user
    const sensitiveFields = new Set(['internalId', 'isSuperAdmin', 'apiPermissions', 'mfaSecret', 'mfaLastStep', 'passwordHash'])
    const safeUser = Object.fromEntries(Object.entries(user).filter(([key]) => !sensitiveFields.has(key)))
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: { ...safeUser, loginIp: request.ip, serverTime: new Date().toISOString() },
    }
  }

  @Post('password')
  @UseGuards(AuthGuard)
  @SecurityOperation('auth.password.change')
  @AuditAction('auth.password.change')
  async changePassword(@Req() request: FastifyRequest, @Body() body: ChangePasswordDto) {
    assertSameOrigin(request)
    const { user, traceId } = request as FastifyRequest & {
      traceId?: string
      user: { internalId: bigint; roles: Array<{ roleType: string }> }
    }
    await this.auth.changePassword(user.internalId, body.currentPassword, body.newPassword, {
      traceId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      roleTypes: user.roles.map((role) => role.roleType),
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }
}
