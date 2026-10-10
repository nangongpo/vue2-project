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

const MIN_CHUNK = 5 * 1024 * 1024
const DEFAULT_CHUNK = 8 * 1024 * 1024
const MAX_CHUNK = 64 * 1024 * 1024
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
    private readonly scans: FileScanService
  ) {}

  async initiate(input: InitiateUploadDto, actor: Actor, idempotencyKey?: string) {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)
    const chunkSize = Math.max(MIN_CHUNK, Math.min(MAX_CHUNK, input.chunkSize || DEFAULT_CHUNK))
    const totalParts = Math.ceil(input.fileSize / chunkSize)
    if (totalParts > MAX_PARTS) throw new BadRequestException('文件分片数量超过上限')
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const tenantId = actor.tenantId
    if (!tenantId) throw new BadRequestException('未确定有效租户数据范围')
    const normalizedIdempotencyKey = idempotencyKey?.trim()
    if (normalizedIdempotencyKey && !/^[A-Za-z0-9._:-]{8,128}$/.test(normalizedIdempotencyKey)) throw new BadRequestException('幂等键格式无效')
    if (normalizedIdempotencyKey) {
      const existing = await this.prisma.uploadSession.findFirst({ where: { userId, idempotencyKey: normalizedIdempotencyKey } })
      if (existing) return successResponse({ uploadId: existing.id, chunkSize: existing.chunkSize, totalParts: existing.totalParts, expiresAt: existing.expiresAt, status: existing.status })
    }
    const uploadId = randomUUID()
    const objectKey = `${randomUUID()}`
    const session = await this.prisma.uploadSession.create({
      data: {
        id: uploadId,
        userId,
        tenantId,
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
        idempotencyKey: normalizedIdempotencyKey,
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
    const pagination = normalizePagination(query)
    const where = {
      ownerUserId: userId,
      uploads: { some: {} },
    }
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

  async partUrls(uploadId: string, partNumbers: number[], actor: Actor) {
    const session = await this.session(uploadId, actor)
    if (!partNumbers.length || partNumbers.length > 100) throw new BadRequestException('分片请求数量无效')
    const unique = [...new Set(partNumbers)]
    if (unique.some((part) => part < 1 || part > session.totalParts)) throw new BadRequestException('分片编号无效')
    return successResponse({
      uploadId,
      parts: unique.map((partNumber) => ({
        partNumber,
        url: `/api/v1/files/uploads/${uploadId}/parts/${partNumber}`,
        expiresAt: session.expiresAt,
      })),
    })
  }

  async status(uploadId: string, actor: Actor) {
    const session = await this.session(uploadId, actor)
    const parts = await this.prisma.uploadPart.findMany({
      where: { uploadSessionId: uploadId, status: 'RECEIVED' },
      orderBy: { partNumber: 'asc' },
      select: { partNumber: true, size: true, checksum: true },
    })
    const current = await this.prisma.uploadSession.findUniqueOrThrow({
      where: { id: uploadId },
      include: {
        file: { select: { id: true, status: true, scanStatus: true, scanDetail: true } },
        finalizeJob: { select: { id: true, status: true, attempts: true, nextRetryAt: true, lastError: true } },
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
      finalizeJob: current.finalizeJob,
      chunkSize: session.chunkSize,
      totalParts: session.totalParts,
      parts,
    })
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
    if (session.status !== 'UPLOADING') return this.currentUploadStatus(session.id)
    const parts = await this.prisma.uploadPart.findMany({
      where: { uploadSessionId: uploadId, status: 'RECEIVED' },
      orderBy: { partNumber: 'asc' },
    })
    if (parts.length !== session.totalParts || parts.some((part, index) => part.partNumber !== index + 1))
      throw new ConflictException('上传分片不完整')
    if (clientSha256 && session.clientSha256 && clientSha256.toLowerCase() !== session.clientSha256.toLowerCase())
      throw new ConflictException('客户端完整性校验值不一致')
    const claimed = await this.prisma.$transaction(async (tx) => {
      const result = await tx.uploadSession.updateMany({ where: { id: uploadId, status: 'UPLOADING' }, data: { status: 'FINALIZING', clientSha256: (clientSha256 || session.clientSha256)?.toLowerCase() } })
      if (!result.count) return false
      const file = await tx.fileObject.create({
        data: {
          tenantId: session.tenantId,
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
      await tx.fileFinalizeJob.create({ data: { fileId: file.id, uploadId } })
      return true
    })
    if (!claimed) return this.currentUploadStatus(uploadId)
    return successResponse({ uploadId, fileId: (await this.prisma.uploadSession.findUniqueOrThrow({ where: { id: uploadId }, select: { fileId: true } })).fileId, uploadStatus: 'FINALIZING', fileStatus: 'QUARANTINED', scanStatus: 'PENDING', retryable: true })
  }

  async abort(uploadId: string, actor: Actor) {
    const session = await this.session(uploadId, actor)
    if (session.status !== 'UPLOADING') throw new ConflictException('当前上传会话不能中止')
    await this.prisma.uploadSession.update({ where: { id: uploadId, status: 'UPLOADING' }, data: { status: 'ABORTED' } })
    await this.storage.removeUpload(uploadId)
    return successResponse(null)
  }

  async download(fileId: string, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const file = await this.prisma.fileObject.findFirst({ where: { id: fileId, ownerUserId: userId, status: 'READY' } })
    if (!file) throw new NotFoundException('文件不存在或尚未通过安全扫描')
    throw new ConflictException('内网对象存储下载签名适配器尚未配置')
  }

  async attach(fileId: string, input: FileBindingDto, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, ownerUserId: userId, status: 'READY', scanStatus: 'CLEAN' },
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
    const binding = await this.prisma.fileBinding.findFirst({ where: { id: bindingId, fileId, createdBy: userId } })
    if (!binding) throw new NotFoundException('文件关联不存在')
    await this.prisma.fileBinding.delete({ where: { id: bindingId } })
    return successResponse(null)
  }

  private async session(uploadId: string, actor: Actor) {
    const userId = await this.prisma.$transaction((tx) => requireActor(tx, actor), serializable)
    const session = await this.prisma.uploadSession.findFirst({ where: { id: uploadId, userId } })
    if (!session) throw new NotFoundException('上传会话不存在')
    if (session.expiresAt <= new Date() && session.status === 'UPLOADING') {
      await this.prisma.uploadSession.update({ where: { id: uploadId }, data: { status: 'EXPIRED' } })
      await this.storage.removeUpload(uploadId)
      throw new ConflictException('上传会话已过期')
    }
    return session
  }

  private async currentUploadStatus(uploadId: string) {
    const session = await this.prisma.uploadSession.findUnique({ where: { id: uploadId }, include: { file: { select: { id: true, status: true, scanStatus: true, scanDetail: true } } } })
    if (!session) throw new NotFoundException('上传会话不存在')
    return successResponse({ uploadId, fileId: session.fileId, uploadStatus: session.status, fileStatus: session.file?.status || 'QUARANTINED', scanStatus: session.file?.scanStatus || 'PENDING', scanDetail: session.file?.scanDetail || null, retryable: ['FAILED', 'EXPIRED'].includes(session.status) })
  }
}
