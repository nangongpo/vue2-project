import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { DataFieldSecurity } from '../../../common/decorators/data-field-security.decorator.js'
import { RoleService } from '../services/role.service.js'
import { actorFrom } from '../domain/authorization.js'
import type { ActorRequest } from '../domain/authorization.js'

export class CreateRoleDto {
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

export class ReasonDto {
  @IsString() @Matches(/\S/) @MaxLength(255) reason!: string
}

@Controller('roles')
@UseGuards(AuthGuard)
export class RoleController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('system.role.read')
  @DataFieldSecurity('system.role')
  list() {
    return this.roles.list()
  }

  @Get('permission-options')
  @RequirePermissions('system.role.options')
  permissionOptions() {
    return this.roles.permissionOptions()
  }

  @Get('assignment-options')
  @RequirePermissions('system.role.assignment-options')
  assignmentOptions() {
    return this.roles.assignmentOptions()
  }

  @Get(':id/grants')
  @RequirePermissions('system.role.grants.read')
  grantsList(@Param('id', ParseUUIDPipe) id: string) {
    return this.roles.listGrants(id)
  }

  @Post()
  @RequirePermissions('system.role.create')
  @DataFieldSecurity('system.role')
  create(@Body() body: CreateRoleDto, @Req() request: ActorRequest) {
    return this.roles.create(body, actorFrom(request))
  }

  @Patch(':id')
  @RequirePermissions('system.role.update')
  @DataFieldSecurity('system.role')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateRoleDto,
    @Req() request: ActorRequest
  ) {
    return this.roles.update(id, body, actorFrom(request))
  }

@Patch(':id/grants')
  // Granting and revoking permissions are one atomic authorization change.
  // The service records both directions in the same audit event; requiring
  // the separate approval-only revoke capability here incorrectly denied the
  // security administrator before the request could reach the risk flow.
  @RequirePermissions('system.role.grant')
  grants(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: GrantPermissionsDto,
    @Req() request: ActorRequest
  ) {
    return this.roles.grants(id, body, actorFrom(request))
  }

  @Patch(':id/enable')
  @RequirePermissions('system.role.enable')
  enable(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto, @Req() request: ActorRequest) {
    return this.roles.enable(id, body.reason, actorFrom(request))
  }

  @Patch(':id/disable')
  @RequirePermissions('system.role.disable')
  disable(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto, @Req() request: ActorRequest) {
    return this.roles.disable(id, body.reason, actorFrom(request))
  }

  @Delete(':id')
  @RequirePermissions('system.role.delete')
  remove(@Param('id', ParseUUIDPipe) id: string, @Req() request: ActorRequest) {
    return this.roles.remove(id, actorFrom(request))
  }
}
