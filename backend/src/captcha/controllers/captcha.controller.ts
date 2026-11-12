import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common'
import { IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { FastifyRequest } from 'fastify'
import { API_CODE } from '#app/common/constants/api-code.js'
import { CaptchaAnswer, CaptchaMode, CaptchaService, CaptchaType } from '#app/captcha/services/captcha.service.js'

class CreateCaptchaDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  attemptId?: string

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  previousChallengeId?: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sceneId?: string

  @IsString()
  @MaxLength(64)
  action!: string

  @IsIn(['EMBED', 'POPUP'])
  mode!: CaptchaMode

  @IsOptional()
  @IsIn(['SIMPLE_SLIDER', 'SLIDER', 'ROTATE', 'GRID_IMAGE_SELECT', 'CLICK_ORDER', 'TEXT_SELECT', 'AUDIO'])
  captchaType?: CaptchaType
}

class VerifyCaptchaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  attemptId!: string

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  challengeId!: string

  @IsIn(['SIMPLE_SLIDER', 'SLIDER', 'ROTATE', 'GRID_IMAGE_SELECT', 'CLICK_ORDER', 'TEXT_SELECT', 'AUDIO'])
  captchaType?: CaptchaType

  @IsString()
  @MaxLength(64)
  action!: string

  @IsObject()
  answer!: CaptchaAnswer
}

@Controller('captcha')
export class CaptchaController {
  constructor(@Inject(CaptchaService) private readonly captcha: CaptchaService) {}

  private assertHttps(request: FastifyRequest) {
    if (process.env.ENABLE_HTTPS === 'true' && request.protocol !== 'https') {
      throw new ForbiddenException('验证码接口必须通过 HTTPS 访问')
    }
  }

  @Post('challenges')
  async create(@Body() body: CreateCaptchaDto, @Req() request: FastifyRequest) {
    this.assertHttps(request)
    const data = await this.captcha.createChallenge(body.username, request.ip, request.headers['user-agent'], {
      sceneId: body.sceneId,
      action: body.action,
      mode: body.mode,
      captchaType: body.captchaType,
      attemptId: body.attemptId,
      previousChallengeId: body.previousChallengeId,
    })
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: VerifyCaptchaDto, @Req() request: FastifyRequest) {
    this.assertHttps(request)
    const data = await this.captcha.verifyChallenge({
      attemptId: body.attemptId,
      challengeId: body.challengeId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      answer: body.answer,
      captchaType: body.captchaType,
      action: body.action,
    })
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }
}
