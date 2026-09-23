import { Global, Module } from '@nestjs/common'
import { PrismaService } from './prisma.service.js'

/** 数据库模块：初始化并共享 Prisma 数据库访问服务。 */
@Global()
@Module({ providers: [PrismaService], exports: [PrismaService] })
export class DatabaseModule {}
