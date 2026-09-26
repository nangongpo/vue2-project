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
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { DataFieldSecurity } from '../../../common/decorators/data-field-security.decorator.js'
import { actorFrom, type ActorRequest } from '../../role/domain/authorization.js'
import {
  CreateOpsTicketDto,
  OpsEvidenceDto,
  OpsExecutionDto,
  OpsNoteDto,
  OpsTicketQueryDto,
  PatchOpsTicketDto,
} from '../dto/ops-ticket.dto.js'
import { OpsTicketService } from '../services/ops-ticket.service.js'

@Controller('ops-tickets')
@UseGuards(AuthGuard)
export class OpsTicketController {
  constructor(@Inject(OpsTicketService) private readonly service: OpsTicketService) {}

  @Post()
  @RequirePermissions('system.ops-ticket.create')
  create(@Body() body: CreateOpsTicketDto, @Req() request: ActorRequest) {
    return this.service.create(body, actorFrom(request))
  }
  @Get()
  @RequirePermissions('system.ops-ticket.read')
  @DataFieldSecurity('system.ops-ticket')
  list(@Query() query: OpsTicketQueryDto) {
    return this.service.list(query)
  }
  @Get(':id')
  @RequirePermissions('system.ops-ticket.detail')
  @DataFieldSecurity('system.ops-ticket')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.detail(id)
  }
  @Patch(':id')
  @RequirePermissions('system.ops-ticket.update')
  patch(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PatchOpsTicketDto,
    @Req() request: ActorRequest
  ) {
    return this.service.patch(id, body, actorFrom(request))
  }
  @Post(':id/submit')
  @RequirePermissions('system.ops-ticket.submit')
  submit(@Param('id', ParseUUIDPipe) id: string, @Req() request: ActorRequest) {
    return this.service.submit(id, actorFrom(request))
  }
  @Post(':id/approve')
  @RequirePermissions('system.ops-ticket.approve')
  approve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpsNoteDto,
    @Req() request: ActorRequest
  ) {
    return this.service.approve(id, body, actorFrom(request))
  }
  @Post(':id/execute')
  @RequirePermissions('system.ops-ticket.execute')
  execute(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpsNoteDto,
    @Req() request: ActorRequest
  ) {
    return this.service.execute(id, body, actorFrom(request))
  }
  @Post(':id/review')
  @RequirePermissions('system.ops-ticket.review')
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpsNoteDto,
    @Req() request: ActorRequest
  ) {
    return this.service.review(id, body, actorFrom(request))
  }
  @Post(':id/cancel')
  @RequirePermissions('system.ops-ticket.cancel')
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpsNoteDto,
    @Req() request: ActorRequest
  ) {
    return this.service.cancel(id, body, actorFrom(request))
  }
  @Post(':id/evidence')
  @RequirePermissions('system.ops-ticket.evidence')
  evidence(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpsEvidenceDto,
    @Req() request: ActorRequest
  ) {
    return this.service.addEvidence(id, body, actorFrom(request))
  }
  @Post(':id/executions')
  @RequirePermissions('system.ops-ticket.executions')
  executions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: OpsExecutionDto,
    @Req() request: ActorRequest
  ) {
    return this.service.addExecution(id, body, actorFrom(request))
  }
}
