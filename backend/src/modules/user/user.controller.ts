import { BadRequestException, Body, Controller, Get, Inject, Param, Patch, Post, Query, UseGuards } from '@nestjs/common'
import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '../../security/auth.guard.js'
import { RequirePermissions } from '../../security/permission.decorator.js'
import { UserService } from './user.service.js'

class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(64) username!: string
  @IsString() @MinLength(12) @MaxLength(128) password!: string
  @IsString() @MinLength(1) @MaxLength(128) displayName!: string
  @IsOptional() @IsArray() @IsString({ each: true }) roleIds?: string[]
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) displayName?: string
  @IsOptional() @IsIn(['ACTIVE', 'LOCKED', 'DISABLED']) status?: 'ACTIVE' | 'LOCKED' | 'DISABLED'
  @IsOptional() @IsArray() @IsString({ each: true }) roleIds?: string[]
}

class ResetPasswordDto {
  @IsString() @MinLength(12) @MaxLength(128) password!: string
}

@Controller('users')
@UseGuards(AuthGuard)
export class UserController {
  constructor(@Inject(UserService) private readonly users: UserService) {}

  @Get()
  @RequirePermissions('user:read')
  page(
    @Query('keyword') keyword = '',
    @Query('status') status?: 'ACTIVE' | 'LOCKED' | 'DISABLED',
    @Query('page') rawPage = '1',
    @Query('pageSize') rawPageSize = '20',
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
  @RequirePermissions('user:create')
  create(@Body() body: CreateUserDto) {
    return this.users.create(body)
  }

  @Patch(':id')
  @RequirePermissions('user:update')
  update(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.users.update(id, body)
  }

  @Post(':id/reset-password')
  @RequirePermissions('user:reset-password')
  resetPassword(@Param('id') id: string, @Body() body: ResetPasswordDto) {
    return this.users.resetPassword(id, body.password)
  }
}
