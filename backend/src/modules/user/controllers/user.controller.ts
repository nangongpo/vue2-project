import {
  BadRequestException,
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
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { UserService } from '../services/user.service.js'
import { actorFrom } from '../../role/domain/authorization.js'
import type { ActorRequest } from '../../role/domain/authorization.js'

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

export class UserStatusDto extends ReasonDto {
  /** 用户状态。 */
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED'
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
  page(
    @Query('keyword') keyword = '',
    @Query('status') status?: 'ACTIVE' | 'LOCKED' | 'DISABLED',
    @Query('page') rawPage = '1',
    @Query('pageSize') rawPageSize = '20'
  ) {
    const page = Number(rawPage)
    const pageSize = Number(rawPageSize)
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('分页参数必须是有效整数，pageSize 最大为 100')
    }
    if (status && !['ACTIVE', 'LOCKED', 'DISABLED'].includes(status)) {
      throw new BadRequestException('用户状态参数无效')
    }
    if (typeof keyword !== 'string' || keyword.length > 64) {
      throw new BadRequestException('关键词长度不能超过 64 个字符')
    }
    return this.users.page({ keyword, status, page, pageSize })
  }

  @Post()
  @RequirePermissions('system.user.create')
  create(@Body() body: CreateUserDto, @Req() request: ActorRequest) {
    return this.users.create(body, actorFrom(request))
  }

  @Patch(':id')
  @RequirePermissions('system.user.update')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateUserDto, @Req() request: ActorRequest) {
    return this.users.update(id, body, actorFrom(request))
  }

  @Patch(':id/roles')
  @RequirePermissions('system.user.grant', 'system.role.revoke')
  roles(@Param('id', ParseUUIDPipe) id: string, @Body() body: AssignRolesDto, @Req() request: ActorRequest) {
    return this.users.roles(id, body, actorFrom(request))
  }

  @Patch(':id/status')
  @RequirePermissions('system.user.disable')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() body: UserStatusDto, @Req() request: ActorRequest) {
    return this.users.status(id, body, actorFrom(request))
  }

  @Post(':id/unlock')
  @RequirePermissions('system.user.unlock')
  unlock(@Param('id', ParseUUIDPipe) id: string, @Body() body: ReasonDto, @Req() request: ActorRequest) {
    return this.users.unlock(id, body.reason, actorFrom(request))
  }

  @Post(':id/reset-password')
  @RequirePermissions('system.user.reset-password')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() body: ResetPasswordDto, @Req() request: ActorRequest) {
    return this.users.resetPassword(id, body.password, actorFrom(request))
  }
}
