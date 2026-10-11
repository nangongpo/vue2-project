import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, ParseIntPipe, ParseUUIDPipe, Post, Put, Query, Req, Res, Sse, StreamableFile, UseGuards } from '@nestjs/common'
import type { FastifyReply } from 'fastify'
import type { FastifyRequest } from 'fastify'
import type { Readable } from 'node:stream'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { SecurityOperation } from '#app/security/decorators/operation.decorator.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { actorFrom } from '#app/modules/role/domain/authorization.js'
import type { ActorRequest } from '#app/modules/role/domain/authorization.js'
import { CompleteUploadDto, FileListQueryDto, InitiateUploadDto } from '#app/modules/file/file.dto.js'
import { FileService } from '#app/modules/file/file.service.js'
import { EventStreamService } from '#app/events/event-stream.service.js'

@Controller('files')
@UseGuards(AuthGuard)
export class FileController {
  constructor(@Inject(FileService) private readonly files: FileService, private readonly events: EventStreamService) {}

  @Post('uploads/initiate')
  @RequirePermissions('file.upload.initiate')
  @SecurityOperation('file.upload.initiate')
  @AuditAction('file.upload.initiated')
  initiate(@Body() body: InitiateUploadDto, @Req() request: ActorRequest) {
    return this.files.initiate(body, actorFrom(request))
  }

  @Get('uploads/mine')
  @RequirePermissions('file.upload.read')
  @SecurityOperation('file.upload.read')
  @DataFieldSecurity('file')
  listMine(@Query() query: FileListQueryDto, @Req() request: ActorRequest) {
    return this.files.listMine(query, actorFrom(request))
  }

  @Get('uploads/unfinished')
  @RequirePermissions('file.upload.resume')
  @SecurityOperation('file.upload.resume')
  @DataFieldSecurity('file.upload')
  unfinished(@Req() request: ActorRequest) {
    return this.files.unfinished(actorFrom(request))
  }

  @Get('uploads/:uploadId/status')
  @RequirePermissions('file.upload.status')
  @SecurityOperation('file.upload.status')
  @DataFieldSecurity('file.upload')
  status(@Param('uploadId', ParseUUIDPipe) uploadId: string, @Req() request: ActorRequest) {
    return this.files.status(uploadId, actorFrom(request))
  }

  @Sse('uploads/:uploadId/events')
  @RequirePermissions('file.upload.events')
  @SecurityOperation('file.upload.events')
  eventsForUpload(@Param('uploadId', ParseUUIDPipe) uploadId: string, @Req() request: ActorRequest) {
    const actor = actorFrom(request)
    return this.events.connect(
      { tenantId: actor.tenantId, subjectType: 'USER', subjectId: request.user.userId || request.user.internalId.toString() },
      () => this.files.eventSnapshot(uploadId, actor),
      (event) => event.eventType === 'file.upload.status.changed' && event.aggregateId === uploadId ? event.payload as Record<string, unknown> : null,
    )
  }

  @Put('uploads/:uploadId/parts/:partNumber')
  @RequirePermissions('file.upload.part')
  @SecurityOperation('file.upload.part')
  writePart(
    @Param('uploadId', ParseUUIDPipe) uploadId: string,
    @Param('partNumber', ParseIntPipe) partNumber: number,
    @Req() request: FastifyRequest,
  ) {
    const contentLength = Number(request.headers['content-length'])
    if (!Number.isSafeInteger(contentLength) || contentLength < 1) throw new BadRequestException('缺少有效 Content-Length')
    const input = request.body as Readable
    if (!input || typeof input.pipe !== 'function') throw new BadRequestException('分片请求体无效')
    return this.files.writePart(uploadId, partNumber, input, contentLength, actorFrom(request as unknown as ActorRequest))
  }

  @Post('uploads/:uploadId/complete')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions('file.upload.complete')
  @SecurityOperation('file.upload.complete')
  @AuditAction('file.upload.completed')
  complete(@Param('uploadId', ParseUUIDPipe) uploadId: string, @Body() body: CompleteUploadDto, @Req() request: ActorRequest) {
    return this.files.complete(uploadId, body.clientSha256, actorFrom(request))
  }

  @Post('uploads/:uploadId/abort')
  @RequirePermissions('file.upload.abort')
  @SecurityOperation('file.upload.abort')
  @AuditAction('file.upload.aborted')
  abort(@Param('uploadId', ParseUUIDPipe) uploadId: string, @Req() request: ActorRequest) {
    return this.files.abort(uploadId, actorFrom(request))
  }

  @Get(':fileId/download-url')
  @RequirePermissions('file.download')
  @SecurityOperation('file.download')
  @AuditAction('file.downloaded')
  async download(@Param('fileId', ParseUUIDPipe) fileId: string, @Req() request: ActorRequest, @Res({ passthrough: true }) response: FastifyReply) {
    const file = await this.files.download(fileId, actorFrom(request))
    response.header('Content-Type', file.contentType)
    response.header('Content-Length', file.size.toString())
    response.header('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`)
    response.header('Cache-Control', 'no-store, private')
    response.header('X-Content-Type-Options', 'nosniff')
    return new StreamableFile(file.stream)
  }

}
