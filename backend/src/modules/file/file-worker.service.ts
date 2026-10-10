import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuditService } from '#app/audit/services/audit.service.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { FileStorageService } from '#app/modules/file/file-storage.service.js'
import { FILE_SCANNER, type FileScanner } from '#app/modules/file/file-scanner.js'

const LEASE_MS = 5 * 60 * 1000
const POLL_MS = 1000

function mimeFromMagic(header: Buffer) {
  if (header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png'
  if (header.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg'
  if (header.subarray(0, 6).toString('ascii') === 'GIF87a' || header.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif'
  if (header.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf'
  if (header.subarray(0, 4).toString('hex') === '504b0304') return 'application/zip'
  return 'application/octet-stream'
}

function extensionOf(name: string) {
  const match = /\.([a-z0-9]{1,16})$/i.exec(name)
  return match?.[1].toLowerCase() || null
}

const MIME_EXTENSIONS: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/gif': ['gif'],
  'application/pdf': ['pdf'],
  'application/zip': ['zip', 'docx', 'xlsx', 'pptx'],
}

@Injectable()
export class FileWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FileWorkerService.name)
  private readonly workerId = `file-worker-${randomUUID()}`
  private timer?: NodeJS.Timeout
  private running = false

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly audit: AuditService,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), POLL_MS)
    this.timer.unref()
    void this.tick()
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer)
  }

  async tick() {
    if (this.running) return
    this.running = true
    try {
      if (await this.finalizeOne()) return
      await this.scanOne()
    } catch (error) {
      this.logger.error(error instanceof Error ? error.message : '文件任务处理失败')
    } finally {
      this.running = false
    }
  }

  private async claimFinalize() {
    const now = new Date()
    const job = await this.prisma.fileFinalizeJob.findFirst({
      where: { OR: [{ status: 'PENDING', nextRetryAt: { lte: now } }, { status: 'RUNNING', lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] },
      orderBy: { createdAt: 'asc' },
    })
    if (!job) return null
    const claimed = await this.prisma.fileFinalizeJob.updateMany({
      where: { id: job.id, OR: [{ status: 'PENDING' }, { status: 'RUNNING', lockedAt: job.lockedAt }] },
      data: { status: 'RUNNING', lockedAt: now, lockedBy: this.workerId, startedAt: job.startedAt || now, attempts: { increment: 1 } },
    })
    return claimed.count ? this.prisma.fileFinalizeJob.findUnique({ where: { id: job.id }, include: { file: true, upload: true } }) : null
  }

  private async finalizeOne() {
    const job = await this.claimFinalize()
    if (!job) return false
    try {
      const merged = await this.storage.mergeToQuarantine(job.upload.id, job.upload.totalParts)
      if (merged.size !== Number(job.upload.fileSize)) throw new Error('服务端合并后的文件大小不匹配')
      if (job.upload.clientSha256 && merged.checksum !== job.upload.clientSha256) throw new Error('文件完整性校验失败')
      const detectedMime = await this.detectMime(job.upload.id)
      if (job.file.declaredMime && detectedMime !== 'application/octet-stream' && job.file.declaredMime.toLowerCase() !== detectedMime)
        throw new Error('声明 MIME 与文件魔数不匹配')
      const extension = extensionOf(job.file.originalName)
      if (extension && detectedMime !== 'application/octet-stream' && !MIME_EXTENSIONS[detectedMime]?.includes(extension))
        throw new Error('文件扩展名与文件魔数不匹配')
      await this.prisma.$transaction(async (tx) => {
        await tx.fileObject.update({ where: { id: job.fileId }, data: { sha256: merged.checksum, size: BigInt(merged.size), detectedMime } })
        await tx.uploadSession.update({ where: { id: job.uploadId }, data: { status: 'SCANNING' } })
        await tx.fileScanJob.create({ data: { fileId: job.fileId } })
        await tx.fileFinalizeJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', finishedAt: new Date(), lockedAt: null, lockedBy: null } })
      })
    } catch (error) {
      await this.failFinalize(job.id, error)
    }
    return true
  }

  private async detectMime(uploadId: string) {
    const stream = await this.storage.readQuarantine(uploadId)
    try {
      for await (const chunk of stream) return mimeFromMagic(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      return 'application/octet-stream'
    } finally {
      stream.destroy()
    }
  }

  private async claimScan() {
    const now = new Date()
    const job = await this.prisma.fileScanJob.findFirst({
      where: { OR: [{ status: 'PENDING', nextRetryAt: { lte: now } }, { status: 'RUNNING', lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } }] },
      orderBy: { createdAt: 'asc' },
    })
    if (!job) return null
    const claimed = await this.prisma.fileScanJob.updateMany({
      where: { id: job.id, OR: [{ status: 'PENDING' }, { status: 'RUNNING', lockedAt: job.lockedAt }] },
      data: { status: 'RUNNING', lockedAt: now, lockedBy: this.workerId, startedAt: job.startedAt || now, attempts: { increment: 1 } },
    })
    return claimed.count ? this.prisma.fileScanJob.findUnique({
      where: { id: job.id },
      include: { file: { include: { uploads: { orderBy: { createdAt: 'desc' }, take: 1 } } } },
    }) : null
  }

  private async scanOne() {
    const job = await this.claimScan()
    if (!job) return false
    try {
      const upload = job.file.uploads[0]
      if (!upload) throw new Error('找不到文件对应的隔离上传会话')
      await this.storage.prepareForScan(upload.id, job.file.storageKey)
      const stream = await this.storage.readQuarantine(upload.id)
      const result = await this.scanner.scan({ stream, size: job.file.size, sha256: job.file.sha256 })
      if (result.verdict === 'ERROR') throw new Error(result.detail || '扫描服务不可用或结果不确定')
      if (result.verdict === 'CLEAN') await this.storage.promote(upload.id, job.file.storageKey)
      await this.prisma.$transaction(async (tx) => {
        await tx.fileObject.update({ where: { id: job.fileId, status: 'QUARANTINED' }, data: { status: result.verdict === 'CLEAN' ? 'READY' : 'REJECTED', scanStatus: result.verdict, scanDetail: result.detail || null, scanEngineVersion: result.engineVersion || null, policyVersion: result.policyVersion || null } })
        await tx.uploadSession.updateMany({ where: { fileId: job.fileId }, data: { status: result.verdict === 'CLEAN' ? 'COMPLETED' : 'FAILED' } })
        await tx.fileScanJob.update({ where: { id: job.id }, data: { status: result.verdict === 'CLEAN' ? 'SUCCEEDED' : 'INFECTED', finishedAt: new Date(), lockedAt: null, lockedBy: null } })
      })
      await this.audit.record({
        traceId: randomUUID(),
        action: result.verdict === 'CLEAN' ? 'file.scan.clean' : 'file.scan.infected',
        resource: 'file',
        method: 'WORKER',
        path: `/internal/file-scan-jobs/${job.id}`,
        result: 'SUCCESS',
        statusCode: 200,
        detail: { fileId: job.fileId, jobId: job.id, verdict: result.verdict, engineVersion: result.engineVersion || null },
      })
    } catch (error) {
      await this.failScan(job.id, job.fileId, error)
    }
    return true
  }

  private async failFinalize(id: string, error: unknown) {
    const job = await this.prisma.fileFinalizeJob.findUnique({ where: { id }, select: { attempts: true, maxAttempts: true, uploadId: true } })
    const terminal = !!job && job.attempts >= job.maxAttempts
    await this.prisma.$transaction(async (tx) => {
      await tx.fileFinalizeJob.updateMany({ where: { id, lockedBy: this.workerId }, data: { status: terminal ? 'DEAD_LETTER' : 'PENDING', nextRetryAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** Math.max(0, (job?.attempts || 1) - 1))), lastError: this.safeError(error), lockedAt: null, lockedBy: null } })
      if (terminal && job) await tx.uploadSession.update({ where: { id: job.uploadId }, data: { status: 'FAILED' } })
    })
  }

  private async failScan(id: string, fileId: string, error: unknown) {
    const job = await this.prisma.fileScanJob.findUnique({ where: { id }, select: { attempts: true, maxAttempts: true } })
    const terminal = !!job && job.attempts >= job.maxAttempts
    await this.prisma.$transaction(async (tx) => {
      await tx.fileScanJob.updateMany({ where: { id, lockedBy: this.workerId }, data: { status: terminal ? 'DEAD_LETTER' : 'PENDING', nextRetryAt: new Date(Date.now() + Math.min(300000, 5000 * 2 ** Math.max(0, (job?.attempts || 1) - 1))), lastError: this.safeError(error), lockedAt: null, lockedBy: null } })
      await tx.fileObject.update({ where: { id: fileId }, data: { status: 'QUARANTINED', scanStatus: 'ERROR', scanDetail: terminal ? '安全扫描失败，请联系管理员' : '安全扫描暂不可用，系统将自动重试' } })
    })
  }

  private safeError(error: unknown) {
    return (error instanceof Error ? error.message : '文件任务失败').replace(/[\r\n]/g, ' ').slice(0, 512)
  }
}
