import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common'
import { IsEnum, IsOptional } from 'class-validator'
import { OperationPolicyStatus } from '#app/common/types/prisma-enums.js'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { OperationPolicyService } from '#app/security/services/operation-policy.service.js'

class OperationPolicyQueryDto {
  @IsOptional() @IsEnum(OperationPolicyStatus) status?: OperationPolicyStatus
}

@Controller('security/operation-policies')
@UseGuards(AuthGuard)
export class OperationPolicyController {
  constructor(@Inject(OperationPolicyService) private readonly policies: OperationPolicyService) {}

  @Get()
  @RequirePermissions('system.operation-policy.read')
  list(@Query() query: OperationPolicyQueryDto) {
    return this.policies.list(query.status)
  }

  @Get('catalog')
  @RequirePermissions('system.operation-policy.read')
  catalog(@Query() query: OperationPolicyQueryDto) {
    return this.policies.catalog(query.status)
  }
}
