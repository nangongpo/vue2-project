import { Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { PasswordService } from '#app/security/services/password.service.js'
import { SecurityModule } from '#app/security/security.module.js'
import { UserController } from '#app/modules/user/controllers/user.controller.js'
import { UserService } from '#app/modules/user/services/user.service.js'

/** 用户模块：提供用户信息、状态、密码和角色关联管理。 */
@Module({
  imports: [DatabaseModule, SecurityModule],
  controllers: [UserController],
  providers: [
    {
      provide: UserService,
      useFactory: (prisma: PrismaService, passwords: PasswordService) => new UserService(prisma, passwords),
      inject: [PrismaService, PasswordService],
    },
  ],
})
export class UserModule {}
