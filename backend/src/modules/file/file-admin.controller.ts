import { FileScanHistoryService } from '#app/modules/file/file-scan-history.service.js'
import { PaginationQueryDto } from '#app/common/dto/pagination.dto.js'
import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { SecurityOperation } from '#app/security/decorators/operation.decorator.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { actorFrom, type ActorRequest } from '#app/modules/role/domain/authorization.js'
import type { ApprovalActor } from '#app/modules/permission/services/approval.service.js'
import { FileAdminQueryDto, FileAdminReasonDto, ScanHistoryQueryDto } from '#app/modules/file/file-admin.dto.js'
import { FileAdminService } from '#app/modules/file/file-admin.service.js'
import { resolveRiskDecision, type RiskLevel } from '#app/security/policies/risk-policy.js'

@Controller('files')
@UseGuards(AuthGuard)
export class FileAdminController {
  constructor(@Inject(FileAdminService) private readonly service: FileAdminService, @Inject(FileScanHistoryService) private readonly history: FileScanHistoryService) {}

  private async outcome<T extends { data: { riskLevel: string } }>(request: ActorRequest, code: string, result: Promise<T>) {
    const response = await result
    Object.assign(request, { riskLevel: response.data.riskLevel, riskDecision: resolveRiskDecision(code, { minimumLevel: response.data.riskLevel as RiskLevel }) })
    return response
  }

  @Get()
  @RequirePermissions('system.file.admin.read')
  @SecurityOperation('system.file.admin.read')
  @DataFieldSecurity('system.file')
  page(@Query() query: FileAdminQueryDto, @Req() request: ActorRequest) { return this.service.page(query, actorFrom(request)) }

  @Get('audit')
  @RequirePermissions('system.file.audit.read')
  @SecurityOperation('system.file.audit.read')
  @DataFieldSecurity('system.file.audit')
  audit(@Query() query: FileAdminQueryDto, @Req() request: ActorRequest) {
    return this.service.auditPage(query, actorFrom(request))
  }

  @Get(':fileId')
  @RequirePermissions('system.file.admin.detail')
  @SecurityOperation('system.file.admin.detail')
  @DataFieldSecurity('system.file')
  detail(@Param('fileId', ParseUUIDPipe) fileId: string, @Req() request: ActorRequest) { return this.service.detail(fileId, actorFrom(request)) }

  @Get(':fileId/scan-jobs')
  @RequirePermissions('system.file.admin.scan-history.read')
  @SecurityOperation('system.file.admin.scan-history.read')
  @DataFieldSecurity('system.file.scan-job')
  scanJobs(@Param('fileId', ParseUUIDPipe) fileId: string, @Query() query: ScanHistoryQueryDto, @Req() request: ActorRequest) { return this.history.page(fileId, query, actorFrom(request)) }

  @Get(':fileId/scan-jobs/:jobId')
  @RequirePermissions('system.file.admin.scan-history.detail')
  @SecurityOperation('system.file.admin.scan-history.detail')
  @DataFieldSecurity('system.file.scan-job')
  scanJob(@Param('fileId', ParseUUIDPipe) fileId: string, @Param('jobId', ParseUUIDPipe) jobId: string, @Req() request: ActorRequest) { return this.history.detail(fileId, jobId, actorFrom(request)) }

  @Get(':fileId/scan-jobs/:jobId/attempts')
  @RequirePermissions('system.file.admin.scan-history.attempts')
  @SecurityOperation('system.file.admin.scan-history.attempts')
  @DataFieldSecurity('system.file.scan-attempt')
  scanAttempts(@Param('fileId', ParseUUIDPipe) fileId: string, @Param('jobId', ParseUUIDPipe) jobId: string, @Query() query: PaginationQueryDto, @Req() request: ActorRequest) { return this.history.attempts(fileId, jobId, query, actorFrom(request)) }

  @Post(':fileId/rescan')
  @RequirePermissions('system.file.admin.scan')
  @SecurityOperation('system.file.admin.scan')
  @AuditAction('file.admin.rescan')
  rescan(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.outcome(request, 'system.file.admin.scan', this.service.rescan(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor, body.releaseReason, request.headers['idempotency-key'])) }

  @Post(':fileId/reject')
  @RequirePermissions('system.file.admin.reject')
  @SecurityOperation('system.file.admin.reject')
  @AuditAction('file.admin.reject')
  reject(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.outcome(request, 'system.file.admin.reject', this.service.reject(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor, request.headers['idempotency-key'])) }

  @Post(':fileId/delete')
  @RequirePermissions('system.file.admin.delete')
  @SecurityOperation('system.file.admin.delete')
  @AuditAction('file.admin.delete')
  delete(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.outcome(request, 'system.file.admin.delete', this.service.delete(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor, request.headers['idempotency-key'])) }

  @Post(':fileId/restore')
  @RequirePermissions('system.file.admin.restore')
  @SecurityOperation('system.file.admin.restore')
  @AuditAction('file.admin.restore')
  restore(@Param('fileId', ParseUUIDPipe) fileId: string, @Body() body: FileAdminReasonDto, @Req() request: ActorRequest) { return this.outcome(request, 'system.file.admin.restore', this.service.restore(fileId, body.reason, actorFrom(request), request.user as unknown as ApprovalActor, body.releaseReason, request.headers['idempotency-key'])) }
}
