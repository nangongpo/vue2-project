import { Controller, Get, Inject, UseGuards } from '@nestjs/common'
import { RequirePermissions } from '../security/decorators/permission.decorator.js'
import { AuthGuard } from '../security/guards/auth.guard.js'
import { DataFieldSecurity } from '../common/decorators/data-field-security.decorator.js'
import { SystemHealthService } from './system-health.service.js'

@Controller('system/health')
@UseGuards(AuthGuard)
@RequirePermissions('system.health.read')
export class SystemHealthController {
  constructor(@Inject(SystemHealthService) private readonly health: SystemHealthService) {}

  @Get()
  @DataFieldSecurity('system.health')
  status() {
    return this.health.status()
  }
}
