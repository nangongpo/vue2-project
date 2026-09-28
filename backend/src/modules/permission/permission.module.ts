import { Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { SecurityModule } from '#app/security/security.module.js'
import { PermissionController } from '#app/modules/permission/controllers/permission.controller.js'
import { PermissionService } from '#app/modules/permission/services/permission.service.js'
import { HttpAdapterHost } from '@nestjs/core'
import { ApprovalController } from '#app/modules/permission/controllers/approval.controller.js'
import { ApprovalService } from '#app/modules/permission/services/approval.service.js'
import { DataScopeController } from '#app/modules/permission/controllers/data-scope.controller.js'
import { DataScopeManagementService } from '#app/modules/permission/services/data-scope.service.js'
import { DataScopeService } from '#app/security/services/data-scope.service.js'
import { OpsTicketController } from '#app/modules/permission/controllers/ops-ticket.controller.js'
import { OpsTicketService } from '#app/modules/permission/services/ops-ticket.service.js'
import { DataFieldController } from '#app/modules/permission/controllers/data-field.controller.js'
import { DataFieldService } from '#app/modules/permission/services/data-field.service.js'
import { DataResourceController } from '#app/modules/permission/controllers/data-resource.controller.js'
import { DataResourceService } from '#app/modules/permission/services/data-resource.service.js'

/** 权限管理模块：维护功能、接口、按钮及其关联关系。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [
    PermissionController,
    ApprovalController,
    DataScopeController,
    OpsTicketController,
    DataFieldController,
    DataResourceController,
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
    {
      provide: DataResourceService,
      useFactory: (prisma: PrismaService) => new DataResourceService(prisma),
      inject: [PrismaService],
    },
  ],
  exports: [DataScopeService],
})
export class PermissionModule {}
