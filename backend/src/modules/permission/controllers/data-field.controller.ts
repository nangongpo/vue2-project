import { Body, Controller, Get, Inject, Param, Patch, Query, Req, UseGuards } from '@nestjs/common'
import { FieldRiskLevel, PermissionStatus } from '@prisma/client'
import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { DataFieldService } from '../services/data-field.service.js'
import type { MutationContext } from '../services/permission.service.js'

class DataFieldQuery {
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,127}$/) resource?: string
}
class DataFieldStatusDto {
  @IsEnum(PermissionStatus) status!: PermissionStatus
}
class DataFieldUpdateDto {
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsIn(['string', 'number', 'boolean', 'enum', 'datetime', 'array', 'object', 'secret'])
  dataType!: string
  @IsEnum(FieldRiskLevel) riskLevel!: FieldRiskLevel
}

@Controller('permission/fields')
@UseGuards(AuthGuard)
export class DataFieldController {
  constructor(@Inject(DataFieldService) private readonly service: DataFieldService) {}

  @Get()
  @RequirePermissions('system.permission.field.read')
  list(@Query() query: DataFieldQuery) {
    return this.service.list(query.resource)
  }

  @Patch(':id')
  @RequirePermissions('system.permission.field.update')
  update(
    @Param('id') id: string,
    @Body() body: DataFieldUpdateDto,
    @Req() request: MutationContext
  ) {
    return this.service.update(id, body, request)
  }

  @Patch(':id/status')
  @RequirePermissions('system.permission.field.disable')
  status(
    @Param('id') id: string,
    @Body() body: DataFieldStatusDto,
    @Req() request: MutationContext
  ) {
    return this.service.status(id, body.status, request)
  }
}
