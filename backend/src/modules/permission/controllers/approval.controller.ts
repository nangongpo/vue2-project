import { Body, Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { ApprovalActionDto, ApprovalQueryDto, CreateApprovalDto } from '../dto/approval.dto.js'
import { ApprovalActor, ApprovalContext, ApprovalService } from '../services/approval.service.js'

type Request = {
  user: ApprovalActor
  traceId?: string
  id?: string
  ip: string
  method: string
  routeOptions?: { url?: string }
  headers: { 'user-agent'?: string }
}
const context = (request: Request): ApprovalContext => ({
  traceId: request.traceId || request.id,
  ip: request.ip,
  method: request.method,
  path: request.routeOptions?.url,
  userAgent: request.headers['user-agent'],
})

@Controller('permission/approvals')
@UseGuards(AuthGuard)
export class ApprovalController {
  constructor(@Inject(ApprovalService) private readonly service: ApprovalService) {}

  @Post()
  @RequirePermissions('system.approval.create')
  create(@Body() body: CreateApprovalDto, @Req() req: Request) {
    return this.service.create(body, req.user, context(req))
  }

  @Get()
  @RequirePermissions('system.approval.read')
  list(@Query() query: ApprovalQueryDto, @Req() req: Request) {
    return this.service.list(query, req.user)
  }

  @Get(':id')
  @RequirePermissions('system.approval.detail')
  detail(@Param('id', new ParseUUIDPipe()) id: string, @Req() req: Request) {
    return this.service.detail(id, req.user)
  }

  @Post(':id/approve')
  @HttpCode(200)
  @RequirePermissions('system.approval.approve')
  approve(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ApprovalActionDto, @Req() req: Request) {
    return this.service.transition(id, 'approve', body, req.user, context(req))
  }

  @Post(':id/execute')
  @HttpCode(200)
  @RequirePermissions('system.approval.execute')
  execute(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ApprovalActionDto, @Req() req: Request) {
    return this.service.transition(id, 'execute', body, req.user, context(req))
  }

  @Post(':id/review')
  @HttpCode(200)
  @RequirePermissions('system.approval.review')
  review(@Param('id', new ParseUUIDPipe()) id: string, @Body() body: ApprovalActionDto, @Req() req: Request) {
    return this.service.transition(id, 'review', body, req.user, context(req))
  }
}
