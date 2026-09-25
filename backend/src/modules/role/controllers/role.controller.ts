import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { RoleService } from '../services/role.service.js'
import { actorFrom } from '../domain/authorization.js'
import type { ActorRequest } from '../domain/authorization.js'

export class CreateRoleDto {
  /** 角色编码。 */
  @IsString() @MinLength(2) @MaxLength(64) code!: string
  /** 角色名称。 */
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  /** 角色描述。 */
  @IsOptional() @IsString() @MaxLength(255) description?: string
}

export class UpdateRoleDto extends CreateRoleDto {}

export class GrantPermissionsDto {
  /** 要授予角色的权限 UUID 列表。 */
  @IsArray()
  @ArrayMaxSize(500)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  permissionIds!: string[]
  /** 权限变更原因，用于审计。 */
  @IsString() @Matches(/\S/) @MaxLength(255) reason!: string
  /** 权限授权失效时间。 */
  @IsOptional() @IsDateString() expiresAt?: string
}

export class RoleStatusDto {
  /** 角色状态。 */
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED'
  /** 状态变更原因。 */
  @IsString() @Matches(/\S/) @MaxLength(255) reason!: string
}

@Controller('roles')
@UseGuards(AuthGuard)
export class RoleController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('system.role.read')
  list() {
    return this.roles.list()
  }

  @Get('permission-options')
  @RequirePermissions('system.role.options')
  permissionOptions() {
    return this.roles.permissionOptions()
  }

  @Post()
  @RequirePermissions('system.role.create')
  create(@Body() body: CreateRoleDto, @Req() request: ActorRequest) {
    return this.roles.create(body, actorFrom(request))
  }

  @Patch(':id')
  @RequirePermissions('system.role.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateRoleDto, @Req() request: ActorRequest) {
    return this.roles.update(id, body, actorFrom(request))
  }

  @Patch(':id/grants')
  @RequirePermissions('system.role.grant', 'system.role.revoke')
  grants(@Param('id', ParseUUIDPipe) id: string, @Body() body: GrantPermissionsDto, @Req() request: ActorRequest) {
    return this.roles.grants(id, body, actorFrom(request))
  }

  @Patch(':id/status')
  @RequirePermissions('system.role.disable')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: RoleStatusDto, @Req() request: ActorRequest) {
    return this.roles.status(id, body, actorFrom(request))
  }

  @Delete(':id')
  @RequirePermissions('system.role.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: ActorRequest) {
    return this.roles.remove(id, actorFrom(request))
  }
}
