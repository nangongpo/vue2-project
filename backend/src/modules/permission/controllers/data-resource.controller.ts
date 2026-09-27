import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { PermissionStatus } from '@prisma/client'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { DataResourceService } from '../services/data-resource.service.js'
import type { MutationContext } from '../services/permission.service.js'

class ResourceQuery {
  @IsOptional() @IsEnum(PermissionStatus) status?: PermissionStatus
}
class CreateResourceDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,127}$/) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsOptional() @IsString() @MaxLength(255) description?: string
}
class UpdateResourceDto {
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsOptional() @IsString() @MaxLength(255) description?: string
}
class ResourceStatusDto {
  @IsEnum(PermissionStatus) status!: PermissionStatus
}

@Controller('permission/data-resources')
@UseGuards(AuthGuard)
export class DataResourceController {
  constructor(private readonly service: DataResourceService) {}

  @Get()
  @RequirePermissions('system.data-resource.read')
  list(@Query() query: ResourceQuery) {
    return this.service.list(query.status)
  }

  @Post()
  @RequirePermissions('system.data-resource.create')
  create(@Body() body: CreateResourceDto, @Req() req: MutationContext) {
    return this.service.create(body, req)
  }

  @Patch(':id')
  @RequirePermissions('system.data-resource.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateResourceDto, @Req() req: MutationContext) {
    return this.service.update(id, body, req)
  }

  @Patch(':id/status')
  @RequirePermissions('system.data-resource.status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: ResourceStatusDto, @Req() req: MutationContext) {
    return this.service.status(id, body.status, req)
  }
}
