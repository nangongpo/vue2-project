import { Module } from '@nestjs/common'
import { SystemHealthController } from '#app/system/system-health.controller.js'
import { SystemHealthService } from '#app/system/system-health.service.js'

@Module({
  controllers: [SystemHealthController],
  providers: [SystemHealthService],
})
export class SystemModule {}
