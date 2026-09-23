import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '../../security/auth.guard.js'
import { RequirePermissions } from '../../security/permission.decorator.js'
import { PermissionManagementService } from './permission-management.service.js'

class CreateApiDto {
  @IsString() @MinLength(2) @MaxLength(128) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @MinLength(3) @MaxLength(16) method!: string
  @IsString() @MinLength(1) @MaxLength(255) path!: string
}

class CreateFunctionDto {
  @IsString() @MinLength(2) @MaxLength(128) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @MinLength(1) @MaxLength(255) route!: string
  @IsOptional() @IsString() @MaxLength(255) component?: string
  @IsOptional() @IsString() @MaxLength(36) parentId?: string
  @IsOptional() @IsInt() sort?: number
  @IsOptional() @IsArray() @IsString({ each: true }) apiIds?: string[]
}

class CreateButtonDto {
  @IsString() @MaxLength(36) functionId!: string
  @IsString() @MinLength(2) @MaxLength(128) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @MinLength(1) @MaxLength(128) label!: string
  @IsOptional() @IsInt() sort?: number
  @IsOptional() @IsArray() @IsString({ each: true }) apiIds?: string[]
}

class MapApisDto {
  @IsArray() @IsString({ each: true }) apiIds!: string[]
}

@Controller('permission-management')
@UseGuards(AuthGuard)
@RequirePermissions('system.permission.manage')
export class PermissionManagementController {
  constructor(@Inject(PermissionManagementService) private readonly service: PermissionManagementService) {}

  @Get('functions') listFunctions() { return this.service.listFunctions() }
  @Post('functions') createFunction(@Body() body: CreateFunctionDto) { return this.service.createFunction(body) }
  @Patch('functions/:id/apis') mapFunctionApis(@Param('id') id: string, @Body() body: MapApisDto) { return this.service.mapFunctionApis(id, body.apiIds) }

  @Get('apis') listApis() { return this.service.listApis() }
  @Post('apis') createApi(@Body() body: CreateApiDto) { return this.service.createApi(body) }

  @Post('buttons') createButton(@Body() body: CreateButtonDto) { return this.service.createButton(body) }
  @Patch('buttons/:id/apis') mapButtonApis(@Param('id') id: string, @Body() body: MapApisDto) { return this.service.mapButtonApis(id, body.apiIds) }
}
