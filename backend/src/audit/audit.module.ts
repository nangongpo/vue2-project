import { Global, Module } from '@nestjs/common'
import { APP_INTERCEPTOR } from '@nestjs/core'
import { AuditInterceptor } from './interceptors/audit.interceptor.js'
import { AuditService } from './services/audit.service.js'
import { DatabaseModule } from '../database/database.module.js'
import { PrismaService } from '../database/prisma.service.js'
import { AuditController } from './controllers/audit.controller.js'
import { Reflector } from '@nestjs/core'

/** 审计模块：记录接口访问、操作结果和审计查询，为安全追溯提供数据。 */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AuditController],
  providers: [
    {
      provide: AuditService,
      useFactory: (prisma: PrismaService) => new AuditService(prisma),
      inject: [PrismaService],
    },
    {
      provide: APP_INTERCEPTOR,
      useFactory: (audit: AuditService, reflector: Reflector) => new AuditInterceptor(audit, reflector),
      inject: [AuditService, Reflector],
    },
  ],
  exports: [AuditService],
})
export class AuditModule {}
