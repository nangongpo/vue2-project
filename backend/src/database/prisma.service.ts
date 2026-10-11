import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect()
    if (process.env.TENANCY_MODE !== 'MULTI') {
      const code = process.env.DEFAULT_TENANT_CODE?.trim()
      if (!code) throw new Error('单租户模式必须配置 DEFAULT_TENANT_CODE')
      const tenant = await this.tenant.findUnique({ where: { code }, select: { id: true, status: true } })
      if (!tenant || tenant.status !== 'ACTIVE') throw new Error(`默认租户不存在或未启用: ${code}`)
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
