import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
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
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'
import { UserService } from '#app/modules/user/services/user.service.js'
import { actorFrom } from '#app/modules/role/domain/authorization.js'
import type { ActorRequest } from '#app/modules/role/domain/authorization.js'
import { PaginationQueryDto } from '#app/common/dto/pagination.dto.js'

export class CreateUserDto {
  /** 登录账号。 */
  @IsString() @MinLength(2) @MaxLength(64) username!: string
  /** 初始密码。 */
  @IsString() @MinLength(12) @MaxLength(128) password!: string
  /** 用户显示名称。 */
  @IsString() @MinLength(1) @MaxLength(128) displayName!: string
}

export class UpdateUserDto {
  /** 用户显示名称。 */
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) displayName?: string
}

export class ReasonDto {
  /** 本次变更原因，用于审计。 */
  @IsString() @Matches(/\S/) @MaxLength(255) reason!: string
}

export class AssignRolesDto extends ReasonDto {
  /** 要授予用户的角色 UUID 列表。 */
  @IsArray() @ArrayMaxSize(500) @ArrayUnique() @IsUUID('all', { each: true }) roleIds!: string[]
  /** 角色授权失效时间。 */
  @IsOptional() @IsDateString() expiresAt?: string
}

class UserQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(64) keyword = ''
  @IsOptional() @IsIn(['ACTIVE', 'LOCKED', 'DISABLED']) status?: 'ACTIVE' | 'LOCKED' | 'DISABLED'
}

class ResetPasswordDto {
  /** 重置后的密码。 */
  @IsString() @MinLength(12) @MaxLength(128) password!: string
}

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get()
  @RequirePermissions('system.user.read')
  @DataFieldSecurity('system.user')
  page(@Query() query: UserQueryDto) {
    return this.users.page(query)
  }

  @Post()
  @RequirePermissions('system.user.create')
  @DataFieldSecurity('system.user')
  create(@Body() body: CreateUserDto, @Req() request: ActorRequest) {
    return this.users.create(body, actorFrom(request))
  }

  @Patch(':id')
  @RequirePermissions('system.user.update')
  @DataFieldSecurity('system.user')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
    @Req() request: ActorRequest
  ) {
    return this.users.update(id, body, actorFrom(request))
  }

  @Patch(':id/roles')
  @RequirePermissions('system.user.grant')
  roles(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AssignRolesDto,
    @Req() request: ActorRequest
  ) {
    return this.users.roles(id, body, actorFrom(request))
  }

  @Patch(':id/enable')
  @RequirePermissions('system.user.enable')
  enable(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto, @Req() request: ActorRequest) {
    return this.users.enable(id, body.reason, actorFrom(request))
  }

  @Patch(':id/disable')
  @RequirePermissions('system.user.disable')
  disable(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto, @Req() request: ActorRequest) {
    return this.users.disable(id, body.reason, actorFrom(request))
  }

  @Post(':id/unlock')
  @RequirePermissions('system.user.unlock')
  unlock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ReasonDto,
    @Req() request: ActorRequest
  ) {
    return this.users.unlock(id, body.reason, actorFrom(request))
  }

  @Post(':id/reset-password')
  @RequirePermissions('system.user.reset-password')
  resetPassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResetPasswordDto,
    @Req() request: ActorRequest
  ) {
    return this.users.resetPassword(id, body.password, actorFrom(request))
  }
}
