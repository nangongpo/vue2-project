import { Module } from '@nestjs/common'
import { CaptchaController } from './captcha/controllers/captcha.controller.js'
import { CaptchaEngine } from './captcha/services/captcha.engine.js'
import { RedisService } from './captcha/services/redis.service.js'

/** 独立验证码服务根模块：组合验证码接口、Redis 状态存储和拼图校验引擎。 */
@Module({
  controllers: [CaptchaController],
  providers: [
    RedisService,
    {
      provide: CaptchaEngine,
      useFactory: (redis: RedisService) => new CaptchaEngine(redis),
      inject: [RedisService],
    },
  ],
})
export class AppModule {}
