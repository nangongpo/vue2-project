import { Module } from '@nestjs/common'
import { CaptchaController } from './captcha.controller.js'
import { CaptchaService } from './captcha.service.js'
import { CacheModule } from '../cache/cache.module.js'
import { RedisService } from '../cache/redis.service.js'

/** 验证码模块：代理独立验证码服务，向业务层提供挑战和校验能力。 */
@Module({
  imports: [CacheModule],
  controllers: [CaptchaController],
  providers: [{
    provide: CaptchaService,
    useFactory: (redis: RedisService) => new CaptchaService(redis),
    inject: [RedisService],
  }],
  exports: [CaptchaService],
})
export class CaptchaModule {}
