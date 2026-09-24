import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Inject, Post, Req } from '@nestjs/common'
import { Type } from 'class-transformer'
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator'
import { FastifyRequest } from 'fastify'
import { API_CODE } from '../../common/constants/api-code.js'
import { CaptchaEvent, CaptchaPoint, CaptchaService } from '../services/captcha.service.js'

class CreateCaptchaDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  username!: string
}

class CaptchaPointDto implements CaptchaPoint {
  @IsNumber()
  x!: number

  @IsNumber()
  y!: number

  @IsNumber()
  t!: number
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

  @IsArray()
  @ArrayMinSize(8)
  @ArrayMaxSize(300)
  @ValidateNested({ each: true })
  @Type(() => CaptchaPointDto)
  points!: CaptchaPointDto[]

  @IsNumber()
  finalX!: number

  @IsNumber()
  trackWidth!: number
}

class CaptchaEventDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  attemptId?: string

  @IsString()
  @MaxLength(32)
  event!: CaptchaEvent

  @IsOptional()
  @IsString()
  @MaxLength(64)
  challengeId?: string

  @IsOptional()
  @IsNumber()
  durationMs?: number

  @IsOptional()
  @IsString()
  @MaxLength(120)
  reason?: string
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
    const data = await this.captcha.createChallenge(body.username, request.ip, request.headers['user-agent'])
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
      points: body.points,
      finalX: body.finalX,
      trackWidth: body.trackWidth,
    })
    return { code: API_CODE.SUCCESS, message: 'success', data }
  }

  @Post('events')
  @HttpCode(HttpStatus.NO_CONTENT)
  async event(@Body() body: CaptchaEventDto, @Req() request: FastifyRequest) {
    this.assertHttps(request)
    await this.captcha.reportEvent({
      event: body.event,
      attemptId: body.attemptId,
      challengeId: body.challengeId,
      durationMs: body.durationMs,
      reason: body.reason,
    })
  }
}
