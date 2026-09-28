import { Controller, Get, Module, ServiceUnavailableException } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { DatabaseModule } from '#app/database/database.module.js'
import { SecurityModule } from '#app/security/security.module.js'
import { AuditModule } from '#app/audit/audit.module.js'
import { UserModule } from '#app/modules/user/user.module.js'
import { RoleModule } from '#app/modules/role/role.module.js'
import { API_CODE } from '#app/common/constants/api-code.js'
import { successResponse } from '#app/common/http/api-response.js'
import { CacheModule } from '#app/cache/cache.module.js'
import { RedisService } from '#app/cache/services/redis.service.js'
import { RateLimitGuard } from '#app/security/guards/rate-limit.guard.js'
import { PermissionModule } from '#app/modules/permission/permission.module.js'
import { CaptchaModule } from '#app/captcha/captcha.module.js'
import { SystemModule } from '#app/system/system.module.js'
import { OrderModule } from '#app/modules/order/order.module.js'

@Controller('health')
class HealthController {
  @Get()
  check() {
    return successResponse({ status: 'ok' })
  }

}

@Controller('ready')
class ReadyController {
  constructor(private readonly redis: RedisService) {}

  @Get()
  async ready() {
    if (!(await this.redis.ready())) {
      throw new ServiceUnavailableException({
        code: API_CODE.SERVICE_UNAVAILABLE,
        message: '服务暂时不可用',
      })
    }
    return successResponse({ status: 'ok', redis: 'ok' })
  }
}

/** 应用根模块：组装业务模块，并注册健康检查与全局请求限频。 */
@Module({
  imports: [DatabaseModule, CacheModule, CaptchaModule, SystemModule, SecurityModule, AuditModule, UserModule, RoleModule, PermissionModule, OrderModule],
  controllers: [HealthController, ReadyController],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (redis: RedisService) => new RateLimitGuard(redis),
      inject: [RedisService],
    },
  ],
})
export class AppModule {}
