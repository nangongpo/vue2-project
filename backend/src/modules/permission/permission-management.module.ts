import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module.js'
import { PrismaService } from '../../database/prisma.service.js'
import { SecurityModule } from '../../security/security.module.js'
import { PermissionManagementController } from './permission-management.controller.js'
import { PermissionManagementService } from './permission-management.service.js'

/** 权限管理模块：维护功能、接口、按钮及其关联关系。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [PermissionManagementController],
  providers: [{
    provide: PermissionManagementService,
    useFactory: (prisma: PrismaService) => new PermissionManagementService(prisma),
    inject: [PrismaService],
  }],
})
export class PermissionManagementModule {}
