import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { SecurityOperation } from '#app/security/decorators/operation.decorator.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { actorFrom, type ActorRequest } from '#app/modules/role/domain/authorization.js'
import type { ApprovalActor } from '#app/modules/permission/services/approval.service.js'
import { FileAdminQueryDto, FileAdminReasonDto } from '#app/modules/file/file-admin.dto.js'
import { FileAdminService } from '#app/modules/file/file-admin.service.js'

@Controller('files')
@UseGuards(AuthGuard)
export class FileAdminController {
  constructor(@Inject(FileAdminService) private readonly service: FileAdminService) {}

  @Get()
  @RequirePermissions('system.file.admin.read')
  @SecurityOperation('system.file.admin.read')
  @DataFieldSecurity('system.file')
  page(@Query() query: FileAdminQueryDto, @Req() request: ActorRequest) { return this.service.page(query, actorFrom(request)) }

  @Get(':fileId')
  @RequirePermissions('system.file.admin.detail')
  @SecurityOperation('system.file.admin.detail')
  @DataFieldSecurity('system.file')
  detail(@Param('fileId', ParseUUIDPipe) fileId: string, @Req() request: ActorRequest) { return this.service.detail(fileId, actorFrom(request)) }

  @Post(':fileId/rescan')
  @RequirePermissions('system.file.admin.scan')
  @SecurityOperation('system.file.admin.scan')
  @AuditAction('file.admin.rescan')
  rescan(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.service.rescan(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor) }

  @Post(':fileId/reject')
  @RequirePermissions('system.file.admin.reject')
  @SecurityOperation('system.file.admin.reject')
  @AuditAction('file.admin.reject')
  reject(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.service.reject(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor) }

  @Post(':fileId/delete')
  @RequirePermissions('system.file.admin.delete')
  @SecurityOperation('system.file.admin.delete')
  @AuditAction('file.admin.delete')
  delete(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.service.delete(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor) }

  @Post(':fileId/restore')
  @RequirePermissions('system.file.admin.restore')
  @SecurityOperation('system.file.admin.restore')
  @AuditAction('file.admin.restore')
  restore(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.service.restore(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor) }
}
