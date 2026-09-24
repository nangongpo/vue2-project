import { Module } from '@nestjs/common'
import { DatabaseModule } from '../../database/database.module.js'
import { PrismaService } from '../../database/prisma.service.js'
import { SecurityModule } from '../../security/security.module.js'
import { RoleController } from './controllers/role.controller.js'
import { RoleService } from './services/role.service.js'

/** 角色模块：提供角色的创建、查询、修改和权限关联管理。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [RoleController],
  providers: [
    {
      provide: RoleService,
      useFactory: (prisma: PrismaService) => new RoleService(prisma),
      inject: [PrismaService],
    },
  ],
})
export class RoleModule {}
