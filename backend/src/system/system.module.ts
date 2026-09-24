import { Module } from '@nestjs/common'
import { SystemHealthController } from './system-health.controller.js'
import { SystemHealthService } from './system-health.service.js'

@Module({
  controllers: [SystemHealthController],
  providers: [SystemHealthService],
})
export class SystemModule {}
