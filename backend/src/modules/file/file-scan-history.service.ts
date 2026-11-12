import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma, type FileScanJob } from '@prisma/client'
import { PrismaService } from '#app/database/prisma.service.js'
import { DataScopeService } from '#app/security/services/data-scope.service.js'
import type { Actor } from '#app/modules/role/domain/authorization.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import { successResponse } from '#app/common/http/api-response.js'

const STATUS: Record<string, string> = { PENDING: '等待执行', RUNNING: '执行中', SUCCEEDED: '执行完成', INFECTED: '感染/违规', DEAD_LETTER: '重试耗尽', CANCELLED: '已中止', FAILED: '执行失败', INTERRUPTED: '执行中断' }
const STAGE: Record<string, string> = { PREPARE: '准备文件', VERSION: '查询引擎版本', SCAN: '病毒扫描', PROMOTE: '存储提升', COMMIT: '提交结果' }
const SUMMARY_SELECT = { id: true, status: true, createdAt: true, startedAt: true, finishedAt: true, attempts: true, historyAvailable: true } as const
function summary(job: Pick<FileScanJob, keyof typeof SUMMARY_SELECT>) {
  return { id: job.id, createdAt: job.createdAt, startedAt: job.startedAt, finishedAt: job.finishedAt, statusLabel: STATUS[job.status], statusTone: job.status === 'SUCCEEDED' ? 'success' : ['PENDING', 'RUNNING'].includes(job.status) ? 'warning' : 'danger', isTerminal: !['PENDING', 'RUNNING'].includes(job.status), attemptCount: job.attempts, historyAvailable: job.historyAvailable }
}

@Injectable()
export class FileScanHistoryService {
  constructor(private readonly prisma: PrismaService, private readonly scopes: DataScopeService) {}
  private async file(fileId: string, actor: Actor) {
    const scope = await this.scopes.where(actor, 'system.file') as Prisma.FileObjectWhereInput
    const file = await this.prisma.fileObject.findFirst({ where: { AND: [scope, { id: fileId, tenantId: actor.tenantId }] }, select: { id: true } })
    if (!file) throw new NotFoundException('文件不存在')
  }
  async page(fileId: string, query: { page?: number; pageSize?: number; approvalId?: string }, actor: Actor) {
    await this.file(fileId, actor)
    const pagination = normalizePagination(query)
    const where: Prisma.FileScanJobWhereInput = { fileId, tenantId: actor.tenantId, ...(query.approvalId ? { triggers: { some: { fileId, tenantId: actor.tenantId, approvalId: query.approvalId } } } : {}) }
    const [total, jobs] = await this.prisma.$transaction([this.prisma.fileScanJob.count({ where }), this.prisma.fileScanJob.findMany({ where, select: SUMMARY_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize })])
    return successResponse(paginationData(jobs.map(summary), total, pagination))
  }
  private async job(fileId: string, jobId: string, actor: Actor) {
    await this.file(fileId, actor)
    const job = await this.prisma.fileScanJob.findFirst({ where: { id: jobId, fileId, tenantId: actor.tenantId }, select: { ...SUMMARY_SELECT, sha256: true, size: true } })
    if (!job) throw new NotFoundException('扫描任务不存在')
    return job
  }
  async detail(fileId: string, jobId: string, actor: Actor) {
    const job = await this.job(fileId, jobId, actor)
    const triggers = await this.prisma.fileScanTrigger.findMany({ where: { jobId, fileId, tenantId: actor.tenantId }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { source: true, approvalId: true, requestedByName: true, executedByName: true, reason: true, createdAt: true, reused: true } })
    return successResponse({ ...summary(job), sha256: job.sha256, size: job.size?.toString() || null, triggers: triggers.map(({ source, ...item }) => ({ ...item, sourceLabel: ({ UPLOAD: '首次上传', RESCAN: '重新扫描', RESTORE: '恢复文件' })[source] })) })
  }
  async attempts(fileId: string, jobId: string, query: { page?: number; pageSize?: number }, actor: Actor) {
    await this.job(fileId, jobId, actor)
    const pagination = normalizePagination(query)
    const where = { jobId, fileId, tenantId: actor.tenantId }
    const [total, attempts] = await this.prisma.$transaction([this.prisma.fileScanAttempt.count({ where }), this.prisma.fileScanAttempt.findMany({ where, select: { id: true, attemptNo: true, status: true, stage: true, verdict: true, scanDetail: true, scanEngineVersion: true, policyVersion: true, startedAt: true, finishedAt: true, durationMs: true, errorCode: true, errorMessage: true }, orderBy: [{ attemptNo: 'desc' }, { id: 'desc' }], skip: (pagination.page - 1) * pagination.pageSize, take: pagination.pageSize })])
    return successResponse(paginationData(attempts.map((attempt) => ({ id: attempt.id, attemptNo: attempt.attemptNo, statusLabel: STATUS[attempt.status], stageLabel: STAGE[attempt.stage], verdictLabel: attempt.verdict ? ({ PENDING: '未获取', CLEAN: '通过', INFECTED: '感染/违规', ERROR: '扫描异常' })[attempt.verdict] : null, scanDetail: attempt.scanDetail, scanEngineVersion: attempt.scanEngineVersion, policyVersion: attempt.policyVersion, startedAt: attempt.startedAt, finishedAt: attempt.finishedAt, durationMs: attempt.durationMs, errorCode: attempt.errorCode, errorMessage: attempt.errorMessage })), total, pagination))
  }
}
