import { Module } from '@nestjs/common'
import { CaptchaController } from '#app/captcha/controllers/captcha.controller.js'
import { CaptchaService } from '#app/captcha/services/captcha.service.js'
import { CacheModule } from '#app/cache/cache.module.js'
import { RedisService } from '#app/cache/services/redis.service.js'
import { AuditModule } from '#app/audit/audit.module.js'
import { AuditService } from '#app/audit/services/audit.service.js'

/** 验证码模块：代理独立验证码服务，向业务层提供挑战和校验能力。 */
@Module({
  imports: [CacheModule, AuditModule],
  controllers: [CaptchaController],
  providers: [
    {
      provide: CaptchaService,
      useFactory: (redis: RedisService, audit: AuditService) => new CaptchaService(redis, audit),
      inject: [RedisService, AuditService],
    },
  ],
  exports: [CaptchaService],
})
export class CaptchaModule {}
