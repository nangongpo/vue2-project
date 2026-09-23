import { BadRequestException, Controller, Get, Inject, Param, Query, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../security/auth.guard.js'
import { RequirePermissions } from '../security/permission.decorator.js'
import { AuditService } from './audit.service.js'
import { AuditAction } from './audit.decorator.js'

@Controller('audit-logs')
@UseGuards(AuthGuard)
@RequirePermissions('audit:read')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @AuditAction('audit.logs.list')
  page(
    @Query('keyword') keyword = '',
    @Query('result') result?: 'SUCCESS' | 'FAILURE',
    @Query('actorId') actorId?: string,
    @Query('from') rawFrom?: string,
    @Query('to') rawTo?: string,
    @Query('page') rawPage = '1',
    @Query('pageSize') rawPageSize = '20',
  ) {
    const page = Number(rawPage)
    const pageSize = Number(rawPageSize)
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new BadRequestException('分页参数必须是有效整数，pageSize 最大为 100')
    }
    if (keyword.length > 128 || (actorId && actorId.length > 64)) throw new BadRequestException('查询参数长度无效')
    if (result && !['SUCCESS', 'FAILURE'].includes(result)) throw new BadRequestException('审计结果参数无效')

    const from = rawFrom ? new Date(rawFrom) : undefined
    const to = rawTo ? new Date(rawTo) : undefined
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) throw new BadRequestException('时间参数格式无效')
    if (from && to && from > to) throw new BadRequestException('开始时间不能晚于结束时间')

    return this.audit.page({ keyword, result, actorId, from, to, page, pageSize })
  }

  @Get(':id')
  @RequirePermissions('audit:detail')
  @AuditAction('audit.logs.detail')
  detail(@Param('id') id: string) {
    if (!id || id.length > 64) throw new BadRequestException('审计记录 ID 无效')
    return this.audit.detail(id)
  }
}
