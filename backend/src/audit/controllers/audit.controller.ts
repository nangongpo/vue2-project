import { BadRequestException, Controller, Get, Inject, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'
import { AuditService } from '#app/audit/services/audit.service.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { IsDateString, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator'
import { RiskLevel } from '#app/common/types/prisma-enums.js'
import { PaginationQueryDto } from '#app/common/dto/pagination.dto.js'
import type { AuditExportQuery, AuditPageRequest } from '#app/audit/types.js'

class ExportAuditQuery implements AuditExportQuery {
  @IsISO8601() from!: string
  @IsISO8601() to!: string
  @IsOptional() @IsString() @MaxLength(128) keyword?: string
  @IsOptional() @IsIn(['SUCCESS', 'FAILURE']) result?: 'SUCCESS' | 'FAILURE'
  @IsOptional() @IsIn(['L0', 'L1', 'L2', 'L3']) riskLevel?: RiskLevel
  @IsOptional() @IsString() @MaxLength(128) operationCode?: string
}

class AuditQueryDto extends PaginationQueryDto implements AuditPageRequest {
  @IsOptional() @IsString() @MaxLength(128) keyword = ''
  @IsOptional() @IsIn(['SUCCESS', 'FAILURE']) result?: 'SUCCESS' | 'FAILURE'
  @IsOptional() @IsIn(['L0', 'L1', 'L2', 'L3']) riskLevel?: RiskLevel
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{2,127}$/) operationCode?: string
  @IsOptional() @IsUUID() actorId?: string
  @IsOptional() @IsDateString() from?: string
  @IsOptional() @IsDateString() to?: string
}

@Controller('audit-logs')
@UseGuards(AuthGuard)
@RequirePermissions('system.audit.read')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @AuditAction('audit.logs.list')
  @DataFieldSecurity('system.audit')
  page(@Query() query: AuditQueryDto) {
    const from = query.from ? new Date(query.from) : undefined
    const to = query.to ? new Date(query.to) : undefined
    if (from && to && from > to) throw new BadRequestException('开始时间不能晚于结束时间')
    return this.audit.page({
      keyword: query.keyword,
      result: query.result,
      riskLevel: query.riskLevel,
      operationCode: query.operationCode,
      actorId: query.actorId,
      from,
      to,
      page: query.page,
      pageSize: query.pageSize,
    })
  }

  @Get('export')
  @RequirePermissions('system.audit.export')
  @AuditAction('audit.logs.export')
  export(@Query() query: ExportAuditQuery) {
    return this.audit.export(query)
  }

  @Get(':id')
  @RequirePermissions('system.audit.detail')
  @AuditAction('audit.logs.detail')
  @DataFieldSecurity('system.audit')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.detail(id)
  }

  @Get(':id/integrity')
  @RequirePermissions('system.audit.integrity')
  @AuditAction('audit.logs.integrity')
  verify(@Param('id', ParseUUIDPipe) id: string) {
    return this.audit.verify(id)
  }
}
