import { Controller, Get, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { DatabaseModule } from './database/database.module.js'
import { SecurityModule } from './security/security.module.js'
import { AuditModule } from './audit/audit.module.js'
import { UserModule } from './modules/user/user.module.js'
import { RoleModule } from './modules/role/role.module.js'
import { API_CODE } from './common/constants/api-code.js'
import { CacheModule } from './cache/cache.module.js'
import { RedisService } from './cache/services/redis.service.js'
import { RateLimitGuard } from './security/guards/rate-limit.guard.js'
import { PermissionModule } from './modules/permission/permission.module.js'
import { CaptchaModule } from './captcha/captcha.module.js'

@Controller('health')
class HealthController {
  @Get()
  check() {
    return {
      code: API_CODE.SUCCESS,
      message: 'success',
      data: { status: 'ok', service: 'backend' },
      timestamp: new Date().toISOString(),
    }
  }
}

/** 应用根模块：组装业务模块，并注册健康检查与全局请求限频。 */
@Module({
  imports: [DatabaseModule, CacheModule, CaptchaModule, SecurityModule, AuditModule, UserModule, RoleModule, PermissionModule],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useFactory: (redis: RedisService) => new RateLimitGuard(redis),
      inject: [RedisService],
    },
  ],
})
export class AppModule {}
