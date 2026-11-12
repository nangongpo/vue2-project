import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type ScanSource } from '@prisma/client'
import { PrismaService } from '#app/database/prisma.service.js'

export type ScanTriggerInput = {
  source: ScanSource; sourceKey: string; approvalId?: string
  requestedBy?: string; executedBy?: string; requestedByName?: string; executedByName?: string; reason: string
  securityReleaseApprovalId?: string
}

@Injectable()
export class FileScanService {
  constructor(private readonly prisma: PrismaService) {}

  async cancel(fileId: string, tenantId: string, db: Prisma.TransactionClient) {
    await db.$queryRaw(Prisma.sql`SELECT id FROM sys_file_object WHERE id = ${fileId} AND tenant_id = ${tenantId} FOR UPDATE`)
    const jobs = await db.fileScanJob.findMany({ where: { fileId, tenantId, status: { in: ['PENDING', 'RUNNING'] } }, select: { id: true } })
    const now = new Date()
    for (const job of jobs) {
      const attempts = await db.fileScanAttempt.findMany({ where: { jobId: job.id, tenantId, fileId, status: 'RUNNING' } })
      for (const attempt of attempts) await db.fileScanAttempt.update({ where: { id: attempt.id }, data: {
        status: 'INTERRUPTED', finishedAt: now, durationMs: Math.min(4294967295, Math.max(0, now.getTime() - attempt.startedAt.getTime())),
        errorCode: 'FILE_OPERATION_CANCELLED', errorMessage: '文件已被删除或拒绝，扫描中止',
      } })
      await db.fileScanJob.update({ where: { id: job.id }, data: { status: 'CANCELLED', finishedAt: now, leaseToken: null, leaseExpiresAt: null, lockedAt: null, lockedBy: null, lastError: '文件已被删除或拒绝，扫描中止', ...(attempts.length ? { latestAttemptId: attempts[attempts.length - 1].id } : {}) } })
    }
  }

  async enqueue(fileId: string, tenantId: string, trigger: ScanTriggerInput, db?: Prisma.TransactionClient): Promise<string> {
    if (!db) return this.prisma.$transaction((tx) => this.enqueue(fileId, tenantId, trigger, tx))
    await db.$queryRaw(Prisma.sql`SELECT id FROM sys_file_object WHERE id = ${fileId} AND tenant_id = ${tenantId} FOR UPDATE`)
    const file = await db.fileObject.findFirst({ where: { id: fileId, tenantId } })
    if (!file) throw new NotFoundException('文件不存在')
    if (file.status === 'DELETED') throw new ConflictException('已删除文件不能扫描')
    if (trigger.securityReleaseApprovalId && trigger.securityReleaseApprovalId !== trigger.approvalId) throw new ConflictException('安全解除必须关联已执行审批')
    if (trigger.securityReleaseApprovalId) {
      const approval = await db.approvalRequest.findFirst({ where: { id: trigger.securityReleaseApprovalId, tenantId, status: 'EXECUTED', kind: { in: ['FILE_RESCAN', 'FILE_RESTORE'] } } })
      const payload = approval?.payload as { fileId?: string; releaseReason?: string } | undefined
      if (payload?.fileId !== fileId || !payload.releaseReason?.trim()) throw new ConflictException('安全解除审批与扫描目标不一致')
    }
    const prior = await db.fileScanTrigger.findUnique({ where: { tenantId_source_sourceKey: { tenantId, source: trigger.source, sourceKey: trigger.sourceKey } } })
    if (prior) {
      if (prior.fileId !== fileId) throw new ConflictException('扫描来源与文件不一致')
      return prior.jobId
    }
    if (!file.sha256 || !/^[a-f0-9]{64}$/i.test(file.sha256)) throw new ConflictException('文件内容摘要缺失，不能创建扫描任务')
    const existing = await db.fileScanJob.findFirst({ where: { fileId, tenantId, status: { in: ['PENDING', 'RUNNING'] } }, orderBy: { createdAt: 'desc' } })
    if (existing && (existing.sha256 !== file.sha256 || existing.size !== file.size || !existing.historyAvailable))
      throw new ConflictException('活动扫描任务内容不一致或需要先完成升级处理')
    if (existing && trigger.securityReleaseApprovalId) throw new ConflictException('存在活动扫描任务，请完成后再申请安全解除')
    const job = existing || await db.fileScanJob.create({ data: { fileId, tenantId, sha256: file.sha256, size: file.size, historyAvailable: true, securityReleaseApprovalId: trigger.securityReleaseApprovalId } })
    const triggerData = { ...trigger }
    delete triggerData.securityReleaseApprovalId
    await db.fileScanTrigger.create({ data: { ...triggerData, tenantId, fileId, jobId: job.id, reused: !!existing } })
    if (!existing) await db.fileObject.update({ where: { id: fileId }, data: {
      currentScanJobId: job.id, latestScanAttemptId: null, status: 'QUARANTINED', scanStatus: 'PENDING', scanDetail: null, scanEngineVersion: null, policyVersion: null,
      ...(!file.securityHold && (file.status === 'REJECTED' || file.scanStatus === 'INFECTED')
        ? { securityHold: 'LEGACY', securityHoldAt: new Date(), securityHoldReason: file.scanDetail } : {}),
    } })
    return job.id
  }
}
