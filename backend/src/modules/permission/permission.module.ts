import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module.js'
import { PrismaService } from '../../database/prisma.service.js'
import { SecurityModule } from '../../security/security.module.js'
import { PermissionController } from './controllers/permission.controller.js'
import { PermissionService } from './services/permission.service.js'
import { HttpAdapterHost } from '@nestjs/core'
import { ApprovalController } from './controllers/approval.controller.js'
import { ApprovalService } from './services/approval.service.js'
import { DataScopeController } from './controllers/data-scope.controller.js'
import { DataScopeManagementService } from './services/data-scope.service.js'
import { DataScopeService } from '../../security/services/data-scope.service.js'
import { OpsTicketController } from './controllers/ops-ticket.controller.js'
import { OpsTicketService } from './services/ops-ticket.service.js'
import { DataFieldController } from './controllers/data-field.controller.js'
import { DataFieldService } from './services/data-field.service.js'

/** 权限管理模块：维护功能、接口、按钮及其关联关系。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [
    PermissionController,
    ApprovalController,
    DataScopeController,
    OpsTicketController,
    DataFieldController,
  ],
  providers: [
    {
      provide: PermissionService,
      useFactory: (prisma: PrismaService) => new PermissionService(prisma),
      inject: [PrismaService],
    },
    {
      provide: ApprovalService,
      useFactory: (prisma: PrismaService, http: HttpAdapterHost) =>
        new ApprovalService(prisma, http),
      inject: [PrismaService, HttpAdapterHost],
    },
    {
      provide: DataScopeManagementService,
      useFactory: (prisma: PrismaService) => new DataScopeManagementService(prisma),
      inject: [PrismaService],
    },
    {
      provide: DataScopeService,
      useFactory: (prisma: PrismaService) => new DataScopeService(prisma),
      inject: [PrismaService],
    },
    {
      provide: OpsTicketService,
      useFactory: (prisma: PrismaService) => new OpsTicketService(prisma),
      inject: [PrismaService],
    },
    {
      provide: DataFieldService,
      useFactory: (prisma: PrismaService) => new DataFieldService(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [DataScopeService],
})
export class PermissionModule {}
