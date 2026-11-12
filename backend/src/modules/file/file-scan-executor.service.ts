import { Inject, Injectable } from '@nestjs/common'
import { Prisma, type FileScanJob, type ScanStage } from '@prisma/client'
import { createHash, randomUUID } from 'node:crypto'
import { Transform } from 'node:stream'
import { PrismaService } from '#app/database/prisma.service.js'
import { AuditService } from '#app/audit/services/audit.service.js'
import { EventOutboxService } from '#app/events/event-outbox.service.js'
import { FileStorageService } from '#app/modules/file/file-storage.service.js'
import { FILE_SCANNER, type FileScanner, type FileScanResult } from '#app/modules/file/file-scanner.js'
import { FILE_SCAN_POLICY } from '#app/modules/file/file-scan-policy.js'
import { UPLOAD_EVENT_VERSION } from '#app/modules/file/file-event.js'

const LEASE_MS = 60_000
const EXECUTION_MS = 4 * 60_000
class LostLease extends Error {}

@Injectable()
export class FileScanExecutorService {
  private readonly workerId = randomUUID()
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: FileStorageService,
    private readonly audit: AuditService,
    private readonly outbox: EventOutboxService,
    @Inject(FILE_SCANNER) private readonly scanner: FileScanner,
  ) {}

  private async lockFile(tx: Prisma.TransactionClient, fileId: string, tenantId: string) {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM sys_file_object WHERE id = ${fileId} AND tenant_id = ${tenantId} FOR UPDATE`)
  }

  private async claim() {
    const now = new Date()
    const candidate = await this.prisma.fileScanJob.findFirst({ where: { OR: [
      { status: 'PENDING', nextRetryAt: { lte: now } }, { status: 'RUNNING', leaseExpiresAt: { lte: now } },
      { status: 'RUNNING', leaseExpiresAt: null },
    ] }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })
    if (!candidate) return null
    return this.prisma.$transaction(async (tx) => {
      await this.lockFile(tx, candidate.fileId, candidate.tenantId)
      const job = await tx.fileScanJob.findUniqueOrThrow({ where: { id: candidate.id }, include: { file: true } })
      if (job.status !== 'PENDING' && job.status !== 'RUNNING') return null
      if (job.status === 'RUNNING' && job.leaseExpiresAt && job.leaseExpiresAt > now) return null
      if (job.status === 'PENDING' && job.nextRetryAt > now) return null
      const interrupted = await tx.fileScanAttempt.findMany({ where: { jobId: job.id, status: 'RUNNING' } })
      for (const attempt of interrupted) await tx.fileScanAttempt.update({ where: { id: attempt.id }, data: {
        status: 'INTERRUPTED', finishedAt: now, durationMs: Math.min(4294967295, Math.max(0, now.getTime() - attempt.startedAt.getTime())),
        errorCode: 'LEASE_EXPIRED', errorMessage: '执行进程中断或租约过期',
      } })
      const valid = job.historyAvailable && job.sha256 && job.size !== null && job.file.tenantId === job.tenantId &&
        job.file.status === 'QUARANTINED' && job.file.currentScanJobId === job.id && job.file.sha256 === job.sha256 && job.file.size === job.size
      if (!valid || job.attempts >= job.maxAttempts) {
        await tx.fileScanJob.update({ where: { id: job.id }, data: { status: valid ? 'DEAD_LETTER' : 'CANCELLED', finishedAt: now, leaseToken: null, leaseExpiresAt: null, lockedAt: null, lockedBy: null, lastError: valid ? '扫描重试次数已达上限' : '文件已删除、任务已被替代或历史任务需要升级' } })
        if (job.file.currentScanJobId === job.id && job.file.status !== 'DELETED') await tx.fileObject.update({ where: { id: job.fileId }, data: { status: 'QUARANTINED', scanStatus: 'ERROR', scanDetail: '扫描已中止，请联系管理员' } })
        await this.audit.record({ traceId: randomUUID(), tenantId: job.tenantId, action: 'file.scan.interrupted', resource: 'file', method: 'WORKER', path: '/internal/file-scans', result: 'FAILURE', statusCode: 409, detail: { fileId: job.fileId, jobId: job.id } }, tx)
        return null
      }
      const leaseToken = randomUUID()
      const attempt = await tx.fileScanAttempt.create({ data: { tenantId: job.tenantId, fileId: job.fileId, jobId: job.id, attemptNo: job.attempts + 1, leaseToken, policyVersion: FILE_SCAN_POLICY.version, traceId: randomUUID() } })
      const claimed = await tx.fileScanJob.update({ where: { id: job.id }, data: { status: 'RUNNING', attempts: { increment: 1 }, leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), lockedAt: now, lockedBy: this.workerId, startedAt: job.startedAt || now } })
      return { job: claimed, attempt, file: job.file }
    })
  }

  private async fence(tx: Prisma.TransactionClient, job: FileScanJob) {
    const now = new Date()
    const claim = await tx.fileScanJob.updateMany({ where: { id: job.id, tenantId: job.tenantId, status: 'RUNNING', leaseToken: job.leaseToken, leaseExpiresAt: { gt: now } }, data: { leaseExpiresAt: new Date(now.getTime() + LEASE_MS) } })
    if (claim.count !== 1) throw new LostLease('扫描租约已失效')
  }

  async processOne() {
    const claimed = await this.claim()
    if (!claimed) return false
    const { job, attempt, file } = claimed
    const abort = new AbortController()
    const deadline = setTimeout(() => abort.abort(new Error('扫描执行超时')), EXECUTION_MS)
    const heartbeat = setInterval(() => {
      void this.prisma.fileScanJob.updateMany({ where: { id: job.id, status: 'RUNNING', leaseToken: job.leaseToken, leaseExpiresAt: { gt: new Date() } }, data: { leaseExpiresAt: new Date(Date.now() + LEASE_MS) } })
        .then((result) => { if (result.count !== 1) abort.abort(new LostLease()) }).catch(() => abort.abort(new LostLease()))
    }, LEASE_MS / 3)
    let stage: ScanStage = 'PREPARE'
    let result: FileScanResult | undefined
    let input: Awaited<ReturnType<FileStorageService['openScanSource']>> | undefined
    let digest: Transform | undefined
    const setStage = async (value: ScanStage) => {
      abort.signal.throwIfAborted()
      stage = value
      const updated = await this.prisma.fileScanAttempt.updateMany({ where: { id: attempt.id, status: 'RUNNING', leaseToken: job.leaseToken! }, data: { stage } })
      if (updated.count !== 1) throw new LostLease()
    }
    try {
      const upload = await this.prisma.uploadSession.findFirst({ where: { fileId: file.id, tenantId: job.tenantId }, orderBy: { createdAt: 'desc' } })
      if (!upload) throw new Error('上传会话缺失')
      const hash = createHash('sha256')
      let size = 0n
      digest = new Transform({ transform(chunk, _encoding, done) { size += BigInt(chunk.length); hash.update(chunk); done(null, chunk) } })
      digest.on('error', () => {})
      input = await this.storage.openScanSource(upload.id, file.storageKey, abort.signal)
      input.on('error', (error) => digest?.destroy(error))
      input.pipe(digest)
      result = await this.scanner.scan({ stream: digest, size: job.size!, sha256: job.sha256, signal: abort.signal, onStage: setStage })
      if (result.verdict === 'ERROR') throw new Error('扫描引擎未返回可信结果')
      if (size !== job.size || hash.digest('hex') !== job.sha256) throw new Error('文件内容快照不一致')
      await setStage('PROMOTE')
      await this.prisma.$transaction(async (tx) => {
        await this.lockFile(tx, job.fileId, job.tenantId)
        await this.fence(tx, job)
        const active = await tx.fileObject.findFirst({ where: { id: job.fileId, tenantId: job.tenantId, currentScanJobId: job.id, status: 'QUARANTINED', sha256: job.sha256, size: job.size! }, select: { id: true, securityHold: true } })
        if (!active) throw new Error('文件状态或内容已变化')
        // Only bounded filesystem metadata operations run under this lock;
        // streaming and hashing are completed outside database transactions.
        if (result!.verdict === 'CLEAN' && (!active.securityHold || job.securityReleaseApprovalId)) await this.storage.publishScannedSource(upload.id, file.storageKey, abort.signal, input!.scanIdentity)
      })
      await setStage('COMMIT')
      await this.settle(job, attempt.id, attempt.startedAt, stage, result, false)
    } catch (error) {
      if (!(error instanceof LostLease) && !(abort.signal.reason instanceof LostLease))
        await this.settle(job, attempt.id, attempt.startedAt, stage, result, true).catch((failure) => { if (!(failure instanceof LostLease)) throw failure })
    } finally {
      clearTimeout(deadline); clearInterval(heartbeat)
      abort.abort()
      input?.destroy(); digest?.destroy()
      await input?.closeScanSource?.()
    }
    return true
  }

  private async settle(job: FileScanJob, attemptId: string, startedAt: Date, stage: ScanStage, result: FileScanResult | undefined, failed: boolean) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockFile(tx, job.fileId, job.tenantId)
      await this.fence(tx, job)
      const file = await tx.fileObject.findFirst({ where: { id: job.fileId, tenantId: job.tenantId } })
      const current = file && file.status === 'QUARANTINED' && file.currentScanJobId === job.id && file.sha256 === job.sha256 && file.size === job.size
      const now = new Date()
      const terminal = job.attempts >= job.maxAttempts
      const success = !failed && !!current
      const status = !current ? 'CANCELLED' : failed ? terminal ? 'DEAD_LETTER' : 'PENDING' : result?.verdict === 'CLEAN' ? 'SUCCEEDED' : 'INFECTED'
      const errorMessage = !current ? '文件已删除、内容变化或任务已被替代' : failed ? `扫描${({ PREPARE: '准备', VERSION: '版本查询', SCAN: '执行', PROMOTE: '存储提升', COMMIT: '结果提交' })[stage]}失败` : null
      const versions = { scanEngineVersion: result?.engineVersion || null, policyVersion: result?.policyVersion || FILE_SCAN_POLICY.version }
      const updated = await tx.fileScanAttempt.updateMany({ where: { id: attemptId, jobId: job.id, status: 'RUNNING', leaseToken: job.leaseToken! }, data: { status: success ? 'SUCCEEDED' : 'FAILED', stage, verdict: result?.verdict || null, scanDetail: result?.verdict === 'INFECTED' ? result.detail?.replace(/[\r\n]/g, ' ').slice(0, 512) : result?.verdict === 'CLEAN' ? 'OK' : null, ...versions, finishedAt: now, durationMs: Math.max(0, now.getTime() - startedAt.getTime()), errorCode: errorMessage ? !current ? 'STALE_FILE' : `SCAN_${stage}_FAILED` : null, errorMessage } })
      if (updated.count !== 1) throw new LostLease()
      await tx.fileScanJob.update({ where: { id: job.id }, data: { status, latestAttemptId: attemptId, finishedAt: status === 'PENDING' ? null : now, lastError: errorMessage, nextRetryAt: new Date(now.getTime() + Math.min(300000, 5000 * 2 ** Math.max(0, job.attempts - 1))), leaseToken: null, leaseExpiresAt: null, lockedAt: null, lockedBy: null } })
      if (current) {
        const clean = success && result?.verdict === 'CLEAN' && (!file.securityHold || Boolean(job.securityReleaseApprovalId))
        const blocked = success && Boolean(file.securityHold) && !clean
        const infected = success && result?.verdict === 'INFECTED'
        await tx.fileObject.update({ where: { id: file.id }, data: { status: clean ? 'READY' : infected || blocked ? 'REJECTED' : 'QUARANTINED',
          ...(infected && !file.securityHold ? { securityHold: 'MALWARE', securityHoldAt: now, securityHoldReason: result?.detail?.slice(0, 512) } : {}),
          ...(clean && file.securityHold ? { securityHold: null, securityHoldAt: null, securityHoldReason: null, releaseApprovalId: job.securityReleaseApprovalId } : {}), scanStatus: success && result?.verdict === 'CLEAN' ? 'CLEAN' : infected ? 'INFECTED' : 'ERROR', scanDetail: infected ? result?.detail?.slice(0, 512) : success && result?.verdict === 'CLEAN' ? 'OK' : errorMessage, ...versions, latestScanAttemptId: attemptId } })
        const uploads = await tx.uploadSession.findMany({ where: { fileId: file.id, tenantId: job.tenantId }, orderBy: { createdAt: 'desc' }, take: 1 })
        const upload = uploads[0]
        if (upload) {
          const uploadStatus = clean ? 'COMPLETED' : infected || blocked || terminal ? 'FAILED' : 'SCANNING'
          await tx.uploadSession.update({ where: { id: upload.id }, data: { status: uploadStatus } })
          await this.outbox.enqueue(tx, { tenantId: job.tenantId, subjectType: 'USER', subjectId: upload.userId, eventType: 'file.upload.status.changed', aggregateType: 'upload', aggregateId: upload.id, aggregateVersion: clean ? UPLOAD_EVENT_VERSION.COMPLETED : uploadStatus === 'FAILED' ? UPLOAD_EVENT_VERSION.FAILED : UPLOAD_EVENT_VERSION.SCANNING, payload: { uploadId: upload.id, fileId: file.id, uploadStatus, fileStatus: clean ? 'READY' : infected || blocked ? 'REJECTED' : 'QUARANTINED', scanStatus: success && result?.verdict === 'CLEAN' ? 'CLEAN' : infected ? 'INFECTED' : 'ERROR' } })
        }
      }
      await this.audit.record({ traceId: randomUUID(), tenantId: job.tenantId, action: success ? result?.verdict === 'CLEAN' ? 'file.scan.clean' : 'file.scan.infected' : 'file.scan.failed', resource: 'file', method: 'WORKER', path: '/internal/file-scans', result: success ? 'SUCCESS' : 'FAILURE', statusCode: success ? 200 : 503, detail: { fileId: job.fileId, jobId: job.id, attemptId, verdict: result?.verdict || null, ...versions } }, tx)
    })
  }
}
