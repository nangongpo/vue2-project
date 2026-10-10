import { Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { SecurityModule } from '#app/security/security.module.js'
import { PermissionModule } from '#app/modules/permission/permission.module.js'
import { ApprovalService } from '#app/modules/permission/services/approval.service.js'
import { RoleController } from '#app/modules/role/controllers/role.controller.js'
import { RoleService } from '#app/modules/role/services/role.service.js'

/** 角色模块：提供角色的创建、查询、修改和权限关联管理。 */
@Module({
  imports: [DatabaseModule, SecurityModule, PermissionModule],
  controllers: [RoleController],
  providers: [
    {
      provide: RoleService,
      useFactory: (prisma: PrismaService, approvals: ApprovalService) => new RoleService(prisma, approvals),
      inject: [PrismaService, ApprovalService],
    },
  ],
})
export class RoleModule {}
