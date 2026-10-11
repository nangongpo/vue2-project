import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { Readable } from 'node:stream'
import { PrismaService } from '#app/database/prisma.service.js'
import { successResponse } from '#app/common/http/api-response.js'
import { FILE_SCAN_STATUS_LABELS, FILE_STATUS_LABELS } from '#app/common/constants/enum-labels.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import { FileStorageService } from '#app/modules/file/file-storage.service.js'
import { FileScanService } from '#app/modules/file/file-scan.service.js'
import { requireActor, serializable, type Actor } from '#app/modules/role/domain/authorization.js'
import type { FileBindingDto, FileListQueryDto, InitiateUploadDto } from '#app/modules/file/file.dto.js'
import { EventOutboxService } from '#app/events/event-outbox.service.js'
import { DataScopeService } from '#app/security/services/data-scope.service.js'
import { UPLOAD_EVENT_VERSION } from '#app/modules/file/file-event.js'

const DEFAULT_CHUNK = 8 * 1024 * 1024
const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const MAX_PARTS = 10_000

function safeName(name: string) {
  return (
    name
      .replace(/[\\/\0\r\n]/g, '_')
      .trim()
      .slice(0, 255) || 'unnamed-file'
  )
}

function extension(name: string) {
  const match = /\.([a-z0-9]{1,16})$/i.exec(name)
  return match ? match[1].toLowerCase() : null
}

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly scans: FileScanService,
    private readonly outbox: EventOutboxService,
    private readonly dataScopes: DataScopeService,
  ) {}

  async initiate(input: InitiateUploadDto, actor: Actor) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    const chunkSize = DEFAULT_CHUNK
    const totalParts = Math.ceil(input.fileSize / chunkSize)
    if (totalParts > MAX_PARTS) throw new BadRequestException('文件分片数量超过上限')
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    if (!actor.organizationId || !actor.departmentId) throw new BadRequestException('当前会话未绑定有效组织和部门')
    await this.dataScopes.where(actor, 'file')
    const uploadId = randomUUID()
    const objectKey = `${randomUUID()}`
    const session = await this.prisma.uploadSession.create({
      data: {
        id: uploadId,
        userId,
        tenantId: actor.tenantId,
        organizationId: actor.organizationId,
        departmentId: actor.departmentId,
        objectKey,
        fileName: safeName(input.fileName),
        declaredMime: input.declaredMime,
        purpose: input.purpose,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        fieldName: input.fieldName,
        fileSize: BigInt(input.fileSize),
        chunkSize,
        totalParts,
        clientSha256: input.clientSha256?.toLowerCase(),
        expiresAt,
      },
    })
    return successResponse({
      uploadId: session.id,
      chunkSize: session.chunkSize,
      totalParts: session.totalParts,
      expiresAt: session.expiresAt,
      status: session.status,
    })
  }

  async listMine(query: FileListQueryDto, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const scope = await this.dataScopes.where(actor, 'file')
    const pagination = normalizePagination(query)
    const where = { AND: [scope, { ownerUserId: userId, tenantId: actor.tenantId, uploads: { some: {} } }] }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.fileObject.count({ where }),
      this.prisma.fileObject.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
        select: {
          id: true,
          originalName: true,
          safeName: true,
          declaredMime: true,
          detectedMime: true,
          extension: true,
          size: true,
          status: true,
          scanStatus: true,
          scanDetail: true,
          createdAt: true,
          updatedAt: true,
          deletedAt: true,
        },
      }),
    ])
    const safeItems = JSON.parse(JSON.stringify(items, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))).map((item: Record<string, unknown>) => {
      const status = typeof item.status === 'string' ? item.status : ''
      const scanStatus = typeof item.scanStatus === 'string' ? item.scanStatus : ''
      return {
        ...item,
        statusLabel: FILE_STATUS_LABELS[status as keyof typeof FILE_STATUS_LABELS] || '—',
        scanStatusLabel: FILE_SCAN_STATUS_LABELS[scanStatus as keyof typeof FILE_SCAN_STATUS_LABELS] || '—',
      }
    })
    return successResponse(paginationData(safeItems, total, pagination))
  }

  async status(uploadId: string, actor: Actor) {
    const session = await this.session(uploadId, actor)
    const parts = await this.prisma.uploadPart.findMany({
      where: { uploadSessionId: uploadId, status: 'RECEIVED', uploadSession: { tenantId: actor.tenantId } },
      orderBy: { partNumber: 'asc' },
      select: { partNumber: true, size: true, checksum: true },
    })
    const current = await this.prisma.uploadSession.findUniqueOrThrow({
      where: { id: uploadId, tenantId: actor.tenantId },
      include: {
        file: { select: { id: true, status: true, scanStatus: true, scanDetail: true } },
      },
    })
    return successResponse({
      uploadId,
      status: current.status,
      uploadStatus: current.status,
      fileId: current.fileId,
      fileStatus: current.file?.status || 'QUARANTINED',
      scanStatus: current.file?.scanStatus || 'PENDING',
      scanDetail: current.file?.scanDetail || null,
      chunkSize: session.chunkSize,
      totalParts: session.totalParts,
      parts,
    })
  }

  async unfinished(actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const now = new Date()
    const sessions = await this.prisma.uploadSession.findMany({
      where: {
        userId,
        tenantId: actor.tenantId,
        organizationId: actor.organizationId || undefined,
        departmentId: actor.departmentId || undefined,
        status: 'UPLOADING',
        expiresAt: { gt: now },
      },
      orderBy: { updatedAt: 'desc' },
      take: 20,
      select: {
        id: true,
        fileName: true,
        declaredMime: true,
        fileSize: true,
        chunkSize: true,
        totalParts: true,
        clientSha256: true,
        expiresAt: true,
        parts: { where: { status: 'RECEIVED' }, orderBy: { partNumber: 'asc' }, select: { partNumber: true, size: true, checksum: true } },
      },
    })
    return successResponse(sessions.map((session) => ({
      uploadId: session.id,
      fileName: session.fileName,
      declaredMime: session.declaredMime,
      fileSize: session.fileSize.toString(),
      chunkSize: session.chunkSize,
      totalParts: session.totalParts,
      clientSha256: session.clientSha256,
      expiresAt: session.expiresAt,
      parts: session.parts,
    })))
  }

  async writePart(uploadId: string, partNumber: number, input: Readable, contentLength: number, actor: Actor) {
    const session = await this.session(uploadId, actor)
    if (session.status !== 'UPLOADING') throw new ConflictException('上传会话状态不允许写入')
    const expectedSize =
      partNumber === session.totalParts
        ? Number(session.fileSize) - session.chunkSize * (session.totalParts - 1)
        : session.chunkSize
    if (partNumber < 1 || partNumber > session.totalParts || contentLength !== expectedSize)
      throw new BadRequestException('分片编号或大小无效')
    const result = await this.storage.writePart(uploadId, partNumber, input, expectedSize)
    await this.prisma.uploadPart.upsert({
      where: { uploadSessionId_partNumber: { uploadSessionId: uploadId, partNumber } },
      create: { uploadSessionId: uploadId, partNumber, size: result.size, checksum: result.checksum },
      update: { size: result.size, checksum: result.checksum, status: 'RECEIVED' },
    })
    return successResponse({ uploadId, partNumber, size: result.size, checksum: result.checksum })
  }

  async complete(uploadId: string, clientSha256: string | undefined, actor: Actor) {
    const session = await this.session(uploadId, actor)
    if (session.status !== 'UPLOADING') return this.currentUploadStatus(session.id, actor.tenantId)
    const parts = await this.prisma.uploadPart.findMany({
      where: { uploadSessionId: uploadId, status: 'RECEIVED', uploadSession: { tenantId: actor.tenantId } },
      orderBy: { partNumber: 'asc' },
    })
    if (parts.length !== session.totalParts || parts.some((part, index) => part.partNumber !== index + 1))
      throw new ConflictException('上传分片不完整')
    if (clientSha256 && session.clientSha256 && clientSha256.toLowerCase() !== session.clientSha256.toLowerCase())
      throw new ConflictException('客户端完整性校验值不一致')
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.uploadSession.updateMany({ where: { id: uploadId, tenantId: actor.tenantId, status: 'UPLOADING' }, data: { status: 'FINALIZING', clientSha256: (clientSha256 || session.clientSha256)?.toLowerCase() } })
      if (!result.count) return false
      const file = await tx.fileObject.create({
        data: {
          tenantId: session.tenantId,
          organizationId: session.organizationId,
          departmentId: session.departmentId,
          ownerUserId: session.userId,
          storageKey: session.objectKey,
          originalName: session.fileName,
          safeName: safeName(session.fileName),
          size: session.fileSize,
          status: 'QUARANTINED',
          scanStatus: 'PENDING',
          extension: extension(session.fileName),
          declaredMime: session.declaredMime,
        },
      })
      await tx.uploadSession.update({ where: { id: uploadId }, data: { fileId: file.id } })
      await tx.fileFinalizeJob.create({ data: { fileId: file.id, tenantId: session.tenantId, uploadId } })
      await this.outbox.enqueue(tx, {
        tenantId: session.tenantId,
        subjectType: 'USER',
        subjectId: session.userId,
        eventType: 'file.upload.status.changed',
        aggregateType: 'upload',
        aggregateId: uploadId,
        aggregateVersion: UPLOAD_EVENT_VERSION.FINALIZING,
        payload: { uploadId, fileId: file.id, uploadStatus: 'FINALIZING', fileStatus: 'QUARANTINED', scanStatus: 'PENDING' },
      })
      return true
    })
    if (!claimed) return this.currentUploadStatus(uploadId, actor.tenantId)
    return successResponse({ uploadId, fileId: (await this.prisma.uploadSession.findFirstOrThrow({ where: { id: uploadId, tenantId: actor.tenantId }, select: { fileId: true } })).fileId, uploadStatus: 'FINALIZING', fileStatus: 'QUARANTINED', scanStatus: 'PENDING', retryable: true })
  }

  async abort(uploadId: string, actor: Actor) {
    const session = await this.session(uploadId, actor)
    if (session.status !== 'UPLOADING') throw new ConflictException('当前上传会话不能中止')
    const aborted = await this.prisma.$transaction(async (tx) => {
      const result = await tx.uploadSession.updateMany({ where: { id: uploadId, tenantId: actor.tenantId, status: 'UPLOADING' }, data: { status: 'ABORTED' } })
      if (!result.count) return false
      await this.outbox.enqueue(tx, {
        tenantId: session.tenantId,
        subjectType: 'USER',
        subjectId: session.userId,
        eventType: 'file.upload.status.changed',
        aggregateType: 'upload',
        aggregateId: uploadId,
        aggregateVersion: UPLOAD_EVENT_VERSION.ABORTED,
        payload: { uploadId, fileId: session.fileId, uploadStatus: 'ABORTED', fileStatus: 'QUARANTINED', scanStatus: 'PENDING' },
      })
      return true
    })
    if (!aborted) throw new ConflictException('上传会话状态已变化')
    await this.storage.removeUpload(uploadId)
    return successResponse(null)
  }

  /** SSE 只使用该最小快照；不返回内部任务、存储键或扫描原始错误。 */
  async eventSnapshot(uploadId: string, actor: Actor) {
    const session = await this.session(uploadId, actor)
    const current = await this.prisma.uploadSession.findUniqueOrThrow({
      where: { id: uploadId, tenantId: actor.tenantId },
      include: { file: { select: { id: true, status: true, scanStatus: true } } },
    })
    return {
      uploadId,
      uploadStatus: current.status,
      fileId: current.fileId,
      fileStatus: current.file?.status || 'QUARANTINED',
      scanStatus: current.file?.scanStatus || 'PENDING',
      chunkSize: session.chunkSize,
      totalParts: session.totalParts,
    }
  }

  async download(fileId: string, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, tenantId: actor.tenantId, ownerUserId: userId, status: 'READY', scanStatus: 'CLEAN' },
      select: { storageKey: true, originalName: true, detectedMime: true, declaredMime: true, size: true },
    })
    if (!file) throw new NotFoundException('文件不存在或尚未通过安全扫描')
    // The local adapter is a controlled stream, not a public filesystem path or
    // an unbounded signed URL. Authorization has already been checked against
    // the current tenant and authenticated owner before opening the object.
    return {
      stream: await this.storage.readObject(file.storageKey),
      filename: file.originalName,
      contentType: file.detectedMime || file.declaredMime || 'application/octet-stream',
      size: file.size,
    }
  }

  async attach(fileId: string, input: FileBindingDto, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, tenantId: actor.tenantId, ownerUserId: userId, status: 'READY', scanStatus: 'CLEAN' },
      select: { id: true, tenantId: true },
    })
    if (!file) throw new NotFoundException('文件不存在、未通过扫描或无权关联')
    const binding = await this.prisma.fileBinding.create({
      data: {
        fileId,
        tenantId: file.tenantId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        fieldName: input.fieldName,
        visibility: input.visibility || 'PRIVATE',
        createdBy: userId,
      },
    })
    return successResponse(binding)
  }

  async detach(fileId: string, bindingId: string, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const binding = await this.prisma.fileBinding.findFirst({ where: { id: bindingId, fileId, tenantId: actor.tenantId, createdBy: userId } })
    if (!binding) throw new NotFoundException('文件关联不存在')
    await this.prisma.fileBinding.delete({ where: { id: bindingId } })
    return successResponse(null)
  }

  private async session(uploadId: string, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const session = await this.prisma.uploadSession.findFirst({
      where: {
        id: uploadId,
        tenantId: actor.tenantId,
        organizationId: actor.organizationId || undefined,
        departmentId: actor.departmentId || undefined,
        userId,
      },
    })
    if (!session) throw new NotFoundException('上传会话不存在')
    if (session.expiresAt <= new Date() && session.status === 'UPLOADING') {
      await this.prisma.uploadSession.updateMany({ where: { id: uploadId, tenantId: actor.tenantId }, data: { status: 'EXPIRED' } })
      await this.storage.removeUpload(uploadId)
      throw new ConflictException('上传会话已过期')
    }
    return session
  }

  private async currentUploadStatus(uploadId: string, tenantId: string) {
    const session = await this.prisma.uploadSession.findFirst({ where: { id: uploadId, tenantId }, include: { file: { select: { id: true, status: true, scanStatus: true, scanDetail: true } } } })
    if (!session) throw new NotFoundException('上传会话不存在')
    return successResponse({ uploadId, fileId: session.fileId, uploadStatus: session.status, fileStatus: session.file?.status || 'QUARANTINED', scanStatus: session.file?.scanStatus || 'PENDING', scanDetail: session.file?.scanDetail || null, retryable: ['FAILED', 'EXPIRED'].includes(session.status) })
  }
}
