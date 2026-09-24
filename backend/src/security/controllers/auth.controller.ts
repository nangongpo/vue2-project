import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Inject, Param, Post, Req, Res, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { FastifyReply, FastifyRequest } from 'fastify'
import { AuthService, SESSION_COOKIE, sessionCookieOptions } from '../services/auth.service.js'
import { AuthGuard } from '../guards/auth.guard.js'
import { API_CODE } from '../../common/constants/api-code.js'
import { AuditAction } from '../../audit/decorators/audit.decorator.js'
import { Idempotent } from '../decorators/idempotency.decorator.js'
import { assertSameOrigin } from '../policies/csrf.js'

class LoginDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  otp?: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string

  @IsOptional()
  @IsString()
  @MaxLength(128)
  captchaToken?: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  attemptId?: string
}

class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword!: string

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string
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
      body.attemptId,
      body.otp
    )
    response.setCookie(SESSION_COOKIE, result.token, sessionCookieOptions(result.expiresIn))
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @AuditAction('auth.logout')
  async logout(@Req() request: FastifyRequest, @Res({ passthrough: true }) response: FastifyReply) {
    assertSameOrigin(request)
    await this.auth.logout(request.cookies?.[SESSION_COOKIE])
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions())
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
