import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { StandardDataScopeType } from '#app/common/types/prisma-enums.js'
import { IsEnum, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { SESSION_COOKIE } from '#app/security/services/auth.service.js'
import type { AuthenticatedUser } from '#app/security/types/auth.types.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { SecurityOperation } from '#app/security/decorators/operation.decorator.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { DataScopeManagementService } from '#app/modules/permission/services/data-scope.service.js'

class GrantDataScopeDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,127}$/) resource!: string
  @IsEnum(StandardDataScopeType) scopeType!: StandardDataScopeType
  @IsOptional() @IsISO8601() expiresAt?: string
  @IsString() @MinLength(1) @MaxLength(255) reason!: string
}
class RevokeDataScopeDto {
  @IsString() @MinLength(1) @MaxLength(255) reason!: string
}
type ScopeRequest = {
  user: AuthenticatedUser
  cookies?: Record<string, string>
  traceId?: string
  ip?: string
  headers: { 'user-agent'?: string }
}
const context = (request: ScopeRequest) => ({
  actor: request.user,
  sessionToken: request.cookies?.[SESSION_COOKIE],
  traceId: request.traceId,
  ip: request.ip,
  userAgent: request.headers['user-agent'],
})

@Controller('permission/roles/:roleId/data-scopes')
@UseGuards(AuthGuard)
export class DataScopeController {
  constructor(@Inject(DataScopeManagementService) private readonly service: DataScopeManagementService) {}
  @Get()
  @RequirePermissions('system.data-scope.read')
  @SecurityOperation('system.data-scope.read')
  @AuditAction('system.data-scope.read')
  list(@Req() request: ScopeRequest, @Param('roleId', ParseUUIDPipe) roleId: string) {
    return this.service.list(context(request), roleId)
  }
  @Post()
  @RequirePermissions('system.data-scope.update')
  @SecurityOperation('system.data-scope.update')
  @AuditAction('system.data-scope.update')
  grant(@Req() request: ScopeRequest, @Param('roleId', ParseUUIDPipe) roleId: string, @Body() body: GrantDataScopeDto) {
    return this.service.grant(context(request), roleId, body)
  }
  @Patch(':scopeId/revoke')
  @RequirePermissions('system.data-scope.revoke')
  @SecurityOperation('system.data-scope.revoke')
  @AuditAction('system.data-scope.revoke')
  revoke(
    @Req() request: ScopeRequest,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Param('scopeId', ParseUUIDPipe) scopeId: string,
    @Body() body: RevokeDataScopeDto
  ) {
    return this.service.revoke(context(request), roleId, scopeId, body.reason)
  }
}
