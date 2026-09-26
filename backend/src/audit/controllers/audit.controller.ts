import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../security/decorators/permission.decorator.js'
import { DataFieldSecurity } from '../../common/decorators/data-field-security.decorator.js'
import { AuditService } from '../services/audit.service.js'
import { AuditAction } from '../decorators/audit.decorator.js'
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator'
import { RiskLevel } from '@prisma/client'

class ExportAuditQuery {
  @IsISO8601() from!: string
  @IsISO8601() to!: string
  @IsOptional() @IsString() @MaxLength(128) keyword?: string
  @IsOptional() @IsIn(['SUCCESS', 'FAILURE']) result?: 'SUCCESS' | 'FAILURE'
  @IsOptional() @IsIn(['L0', 'L1', 'L2', 'L3']) riskLevel?: RiskLevel
  @IsOptional() @IsString() @MaxLength(128) operationCode?: string
}

@Controller('audit-logs')
@UseGuards(AuthGuard)
@RequirePermissions('system.audit.read')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @AuditAction('audit.logs.list')
  @DataFieldSecurity('system.audit')
  page(
    @Query('keyword') keyword = '',
    @Query('result') result?: 'SUCCESS' | 'FAILURE',
    @Query('riskLevel') riskLevel?: RiskLevel,
    @Query('operationCode') operationCode?: string,
    @Query('actorId') actorId?: string,
    @Query('from') rawFrom?: string,
    @Query('to') rawTo?: string,
    @Query('page') rawPage = '1',
    @Query('pageSize') rawPageSize = '20'
  ) {
    const page = Number(rawPage)
    const pageSize = Number(rawPageSize)
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      !Number.isInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      throw new BadRequestException('分页参数必须是有效整数，pageSize 最大为 100')
    }
    if (
      keyword.length > 128 ||
      (actorId && actorId.length > 64) ||
      (operationCode && operationCode.length > 128)
    )
      throw new BadRequestException('查询参数长度无效')
    if (result && !['SUCCESS', 'FAILURE'].includes(result))
      throw new BadRequestException('审计结果参数无效')
    if (riskLevel && !['L0', 'L1', 'L2', 'L3'].includes(riskLevel))
      throw new BadRequestException('风险等级参数无效')

    const from = rawFrom ? new Date(rawFrom) : undefined
    const to = rawTo ? new Date(rawTo) : undefined
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime())))
      throw new BadRequestException('时间参数格式无效')
    if (from && to && from > to) throw new BadRequestException('开始时间不能晚于结束时间')

    return this.audit.page({
      keyword,
      result,
      riskLevel,
      operationCode,
      actorId,
      from,
      to,
      page,
      pageSize,
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
  detail(@Param('id') id: string) {
    if (!id || id.length > 64) throw new BadRequestException('审计记录 ID 无效')
    return this.audit.detail(id)
  }

  @Get(':id/integrity')
  @RequirePermissions('system.audit.integrity')
  @AuditAction('audit.logs.integrity')
  verify(@Param('id') id: string) {
    if (!id || id.length > 64) throw new BadRequestException('审计记录 ID 无效')
    return this.audit.verify(id)
  }
}
