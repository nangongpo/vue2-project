import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, UseGuards } from '@nestjs/common'
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '../../security/auth.guard.js'
import { RequirePermissions } from '../../security/permission.decorator.js'
import { RoleService } from './role.service.js'

class CreateRoleDto {
  @IsString() @MinLength(2) @MaxLength(64) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsOptional() @IsString() @MaxLength(255) description?: string
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED'
  @IsOptional() @IsArray() @IsString({ each: true }) permissionIds?: string[]
}

class UpdateRoleDto extends CreateRoleDto {}

@Controller('roles')
@UseGuards(AuthGuard)
export class RoleController {
  constructor(@Inject(RoleService) private readonly roles: RoleService) {}

  @Get()
  @RequirePermissions('role:read')
  list() { return this.roles.list() }

  @Post()
  @RequirePermissions('role:create')
  create(@Body() body: CreateRoleDto) { return this.roles.create(body) }

  @Patch(':id')
  @RequirePermissions('role:update')
  update(@Param('id') id: string, @Body() body: UpdateRoleDto) { return this.roles.update(id, body) }

  @Delete(':id')
  @RequirePermissions('role:delete')
  remove(@Param('id') id: string) { return this.roles.remove(id) }
}
