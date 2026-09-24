import { Global, Module } from '@nestjs/common'
import { APP_GUARD, Reflector } from '@nestjs/core'
import { AuthController } from './controllers/auth.controller.js'
import { AuthGuard, MfaAuthGuard } from './guards/auth.guard.js'
import { AuthService } from './services/auth.service.js'
import { PasswordService } from './services/password.service.js'
import { PasswordPolicyService } from './services/password-policy.service.js'
import { PermissionGuard } from './guards/permission.guard.js'
import { DatabaseModule } from '../database/database.module.js'
import { PrismaService } from '../database/prisma.service.js'
import { RedisService } from '../cache/services/redis.service.js'
import { CaptchaModule } from '../captcha/captcha.module.js'
import { CaptchaService } from '../captcha/services/captcha.service.js'
import { IdempotencyGuard } from './guards/idempotency.guard.js'
import { MfaService } from './services/mfa.service.js'
import { MfaController } from './controllers/mfa.controller.js'
import { OperationPolicyService } from './services/operation-policy.service.js'
import { OperationPolicyController } from './controllers/operation-policy.controller.js'

/** 安全模块：处理认证、密码、权限、登录限频和请求幂等控制。 */
@Global()
@Module({
  imports: [DatabaseModule, CaptchaModule],
  controllers: [AuthController, MfaController, OperationPolicyController],
  providers: [
    PasswordService,
    {
      provide: PasswordPolicyService,
      useFactory: (passwords: PasswordService) => new PasswordPolicyService(passwords),
      inject: [PasswordService],
    },
    {
      provide: MfaService,
      useFactory: (prisma: PrismaService, passwords: PasswordService, redis: RedisService) => new MfaService(prisma, passwords, redis),
      inject: [PrismaService, PasswordService, RedisService],
    },
    {
      provide: AuthService,
      useFactory: (prisma: PrismaService, passwords: PasswordService, redis: RedisService, captcha: CaptchaService, mfa: MfaService) =>
        new AuthService(prisma, passwords, redis, captcha, mfa),
      inject: [PrismaService, PasswordService, RedisService, CaptchaService, MfaService],
    },
    AuthGuard,
    MfaAuthGuard,
    {
      provide: OperationPolicyService,
      useFactory: (prisma: PrismaService) => new OperationPolicyService(prisma),
      inject: [PrismaService],
    },
    IdempotencyGuard,
    Reflector,
    {
      provide: APP_GUARD,
      useFactory: (auth: AuthService, policies: OperationPolicyService) => new PermissionGuard(new Reflector(), auth, policies),
      inject: [AuthService, OperationPolicyService],
    },
    {
      provide: APP_GUARD,
      useFactory: (redis: RedisService) => new IdempotencyGuard(redis, new Reflector()),
      inject: [RedisService],
    },
  ],
  exports: [AuthService, AuthGuard, PasswordService, PasswordPolicyService, MfaService, OperationPolicyService],
})
export class SecurityModule {}
