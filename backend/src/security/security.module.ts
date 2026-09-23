import { Global, Module } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { AuthController } from './auth.controller.js'
import { AuthGuard } from './auth.guard.js'
import { AuthService } from './auth.service.js'
import { PasswordService } from './password.service.js'
import { PermissionGuard } from './permission.guard.js'
import { DatabaseModule } from '../database/database.module.js'
import { PrismaService } from '../database/prisma.service.js'
import { RedisService } from '../cache/redis.service.js'
import { CaptchaModule } from '../captcha/captcha.module.js'
import { CaptchaService } from '../captcha/captcha.service.js'
import { IdempotencyGuard } from './idempotency.guard.js'

/** 安全模块：处理认证、密码、权限、登录限频和请求幂等控制。 */
@Global()
@Module({
  imports: [DatabaseModule, CaptchaModule],
  controllers: [AuthController],
  providers: [
    PasswordService,
    {
      provide: AuthService,
      useFactory: (prisma: PrismaService, passwords: PasswordService, redis: RedisService, captcha: CaptchaService) => new AuthService(prisma, passwords, redis, captcha),
      inject: [PrismaService, PasswordService, RedisService, CaptchaService],
    },
    AuthGuard,
    IdempotencyGuard,
    Reflector,
    {
      provide: APP_GUARD,
      useFactory: (auth: AuthService) => new PermissionGuard(new Reflector(), auth),
      inject: [AuthService],
    },
    {
      provide: APP_GUARD,
      useFactory: (redis: RedisService) => new IdempotencyGuard(redis, new Reflector()),
      inject: [RedisService],
    },
  ],
  exports: [AuthService, AuthGuard, PasswordService],
})
export class SecurityModule {}
