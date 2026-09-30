import { BadRequestException, Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, PipeTransform, Post, Req, Res, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { FastifyReply, FastifyRequest } from 'fastify'
import {
  AuthService,
  PREAUTH_COOKIE,
  SESSION_COOKIE,
  preAuthCookieOptions,
  sessionCookieOptions,
} from '#app/security/services/auth.service.js'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { API_CODE } from '#app/common/constants/api-code.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { Idempotent } from '#app/security/decorators/idempotency.decorator.js'
import { assertSameOrigin } from '#app/security/policies/csrf.js'
import { SecurityOperation } from '#app/security/decorators/operation.decorator.js'
import { USER_STATUS_LABELS } from '#app/common/constants/enum-labels.js'

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

class SessionIdPipe implements PipeTransform<string, string> {
  transform(value: string) {
    if (!/^[a-f0-9]{64}$/.test(value)) throw new BadRequestException('会话标识无效')
    return value
  }
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
  async revokeSession(@Req() request: FastifyRequest, @Param('id', SessionIdPipe) sessionId: string) {
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
        user: Record<string, unknown> & { internalId?: string }
      }
    ).user
    const sensitiveFields = new Set(['internalId', 'apiPermissions', 'mfaSecret', 'mfaLastStep', 'password'])
    const safeUser = Object.fromEntries(Object.entries(user).filter(([key]) => !sensitiveFields.has(key)))
    const { status, ...publicUser } = safeUser
    const normalizedStatus = typeof status === 'string' ? status : 'DISABLED'
    const roles = Array.isArray(publicUser.roles)
      ? publicUser.roles
          .filter((role): role is Record<string, unknown> => !!role && typeof role === 'object')
          .map((role) => ({ name: typeof role.name === 'string' ? role.name : '' }))
          .filter((role) => role.name)
      : []
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: {
        ...publicUser,
        roles,
        statusLabel: USER_STATUS_LABELS[normalizedStatus as keyof typeof USER_STATUS_LABELS] || '未知状态',
        isActive: normalizedStatus === 'ACTIVE',
        isLocked: normalizedStatus === 'LOCKED',
        loginIp: request.ip,
        serverTime: new Date().toISOString(),
      },
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
