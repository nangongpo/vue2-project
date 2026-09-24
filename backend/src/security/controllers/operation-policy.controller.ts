import { BadRequestException, Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { RiskLevel, OperationPolicyStatus } from '@prisma/client'
import { AuthGuard } from '../guards/auth.guard.js'
import { RequirePermissions } from '../decorators/permission.decorator.js'
import { OperationPolicyService } from '../services/operation-policy.service.js'

class CreateOperationPolicyDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{2,127}$/) operationCode!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,127}$/) resource!: string
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,63}$/) action!: string
  @IsIn(['L0', 'L1', 'L2', 'L3']) riskLevel!: RiskLevel
  @IsOptional() @IsIn(['L0', 'L1', 'L2', 'L3']) minimumRiskLevel?: RiskLevel
  @IsOptional() @IsBoolean() requireMfa?: boolean
  @IsOptional() @IsBoolean() requireReauth?: boolean
  @IsOptional() @IsBoolean() requireApproval?: boolean
  @IsOptional() @IsBoolean() requireDualControl?: boolean
  @IsOptional() @IsBoolean() auditRequired?: boolean
  @IsOptional() @IsString() @MaxLength(255) reason?: string
}

@Controller('security/operation-policies')
@UseGuards(AuthGuard)
export class OperationPolicyController {
  constructor(@Inject(OperationPolicyService) private readonly policies: OperationPolicyService) {}

  @Get()
  @RequirePermissions('system.operation-policy.read')
  list(@Query('status') status?: OperationPolicyStatus) {
    if (status && !Object.values(OperationPolicyStatus).includes(status)) throw new BadRequestException('策略状态参数无效')
    return this.policies.list(status)
  }

  @Get('catalog')
  @RequirePermissions('system.operation-policy.read')
  catalog(@Query('status') status?: OperationPolicyStatus) {
    if (status && !Object.values(OperationPolicyStatus).includes(status)) throw new BadRequestException('策略状态参数无效')
    return this.policies.catalog(status)
  }

  @Post()
  @RequirePermissions('system.operation-policy.manage')
  create(@Body() body: CreateOperationPolicyDto) {
    return this.policies.create(body)
  }

  @Post(':id/activate')
  @RequirePermissions('system.operation-policy.activate')
  activate(@Param('id', ParseUUIDPipe) id: string) {
    return this.policies.activate(id)
  }

  @Patch(':id/disable')
  @RequirePermissions('system.operation-policy.disable')
  disable(@Param('id', ParseUUIDPipe) id: string) {
    return this.policies.disable(id)
  }
}
