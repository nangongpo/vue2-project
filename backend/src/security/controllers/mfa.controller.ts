import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Req, Res, UseGuards } from '@nestjs/common'
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { FastifyReply, FastifyRequest } from 'fastify'
import { API_CODE } from '../../common/constants/api-code.js'
import { AuditAction } from '../../audit/decorators/audit.decorator.js'
import { AuthGuard } from '../guards/auth.guard.js'
import { SESSION_COOKIE } from '../services/auth.service.js'
import { assertSameOrigin } from '../policies/csrf.js'
import { MfaService } from '../services/mfa.service.js'

class PasswordProofDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password!: string
}

class ConfirmMfaDto {
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string
}

class ReauthenticateDto extends PasswordProofDto {
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/)
  otp?: string
}

type AuthRequest = FastifyRequest & { user: { internalId: bigint } }

@Controller('auth')
@UseGuards(AuthGuard)
export class MfaController {
  constructor(@Inject(MfaService) private readonly mfa: MfaService) {}

  @Get('mfa/status')
  @AuditAction('auth.mfa.status')
  status(@Req() request: AuthRequest, @Res({ passthrough: true }) response: FastifyReply) {
    response.header('Cache-Control', 'no-store, private')
    response.header('Pragma', 'no-cache')
    const user = request.user as AuthRequest['user'] & {
      mfaEnabled?: boolean
      mfaRequired?: boolean
      mfaVerifiedAt?: Date | null
      reauthenticatedAt?: Date | null
    }
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: {
        mfaEnabled: Boolean(user.mfaEnabled),
        mfaRequired: Boolean(user.mfaRequired),
        mfaVerifiedAt: user.mfaVerifiedAt || null,
        reauthenticatedAt: user.reauthenticatedAt || null,
      },
    }
  }

  @Post('mfa/enroll')
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.mfa.enroll')
  async enroll(@Body() body: PasswordProofDto, @Req() request: AuthRequest, @Res({ passthrough: true }) response: FastifyReply) {
    assertSameOrigin(request)
    response.header('Cache-Control', 'no-store')
    const data = await this.mfa.enroll(request.user.internalId, body.password, request.cookies?.[SESSION_COOKIE])
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }

  @Post('mfa/confirm')
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.mfa.confirm')
  async confirm(@Body() body: ConfirmMfaDto, @Req() request: AuthRequest) {
    assertSameOrigin(request)
    const data = await this.mfa.confirm(request.user.internalId, body.otp, request.cookies?.[SESSION_COOKIE])
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }

  @Post('reauth')
  @HttpCode(HttpStatus.OK)
  @AuditAction('auth.reauthenticate')
  async reauthenticate(@Body() body: ReauthenticateDto, @Req() request: AuthRequest) {
    assertSameOrigin(request)
    const data = await this.mfa.reauthenticate(request.user.internalId, body.password, body.otp, request.cookies?.[SESSION_COOKIE])
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }
}
