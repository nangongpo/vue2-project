import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { FieldRiskLevel, PermissionStatus } from '#app/common/types/prisma-enums.js'
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { DataFieldService } from '#app/modules/permission/services/data-field.service.js'
import type { MutationContext } from '#app/modules/permission/services/permission.service.js'

class DataFieldQuery {
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,127}$/) resource?: string
}
class DataFieldUpdateDto {
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsIn(['string', 'number', 'boolean', 'enum', 'datetime', 'array', 'object', 'secret'])
  dataType!: string
  @IsEnum(FieldRiskLevel) riskLevel!: FieldRiskLevel
}
class DataFieldCreateDto extends DataFieldUpdateDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,127}$/) resource!: string
  @IsString() @Matches(/^[a-z][a-zA-Z0-9_]{0,127}$/) field!: string
  @IsOptional() @IsBoolean() writable?: boolean
}

@Controller('permission/fields')
@UseGuards(AuthGuard)
export class DataFieldController {
  constructor(@Inject(DataFieldService) private readonly service: DataFieldService) {}

  @Post()
  @RequirePermissions('system.field.create')
  create(@Body() body: DataFieldCreateDto, @Req() request: MutationContext) {
    return this.service.create(body, request)
  }

  @Get()
  @RequirePermissions('system.field.read')
  list(@Query() query: DataFieldQuery) {
    return this.service.list(query.resource)
  }

  @Patch(':id')
  @RequirePermissions('system.field.update')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: DataFieldUpdateDto,
    @Req() request: MutationContext
  ) {
    return this.service.update(id, body, request)
  }

  @Patch(':id/enable')
  @RequirePermissions('system.field.enable')
  enable(@Param('id', ParseUUIDPipe) id: string, @Req() request: MutationContext) {
    return this.service.status(id, PermissionStatus.ACTIVE, request)
  }

  @Patch(':id/disable')
  @RequirePermissions('system.field.disable')
  disable(@Param('id', ParseUUIDPipe) id: string, @Req() request: MutationContext) {
    return this.service.status(id, PermissionStatus.DISABLED, request)
  }
}
