import { randomUUID, createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { PrismaClient } from '@prisma/client'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileScanService } from '#app/modules/file/file-scan.service.js'
import { FileScanExecutorService } from '#app/modules/file/file-scan-executor.service.js'
import { AuditService } from '#app/audit/services/audit.service.js'
import { EventOutboxService } from '#app/events/event-outbox.service.js'
import { ClamAvFileScanner } from '#app/modules/file/clamav-file-scanner.js'

const prisma = new PrismaClient()
const fileIds: string[] = []; const uploadIds: string[] = []; const traces: string[] = []; const approvalIds: string[] = []
const bytes = Buffer.from('scan history integration test')
const sha256 = createHash('sha256').update(bytes).digest('hex')
const scheduled = new Date(Date.now() + 86_400_000)

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(scheduled.getTime() + 1000)) })
afterEach(async () => {
  vi.useRealTimers(); vi.restoreAllMocks()
  await prisma.eventOutbox.deleteMany({ where: { aggregateId: { in: uploadIds } } })
  await prisma.auditLog.deleteMany({ where: { traceId: { in: traces } } })
  await prisma.fileScanAttempt.deleteMany({ where: { fileId: { in: fileIds } } })
  await prisma.fileScanTrigger.deleteMany({ where: { fileId: { in: fileIds } } })
  await prisma.fileScanJob.deleteMany({ where: { fileId: { in: fileIds } } })
  await prisma.uploadSession.deleteMany({ where: { id: { in: uploadIds } } })
  await prisma.fileObject.deleteMany({ where: { id: { in: fileIds } } })
  await prisma.approvalRequest.deleteMany({ where: { id: { in: approvalIds } } })
  fileIds.length = 0; uploadIds.length = 0; traces.length = 0; approvalIds.length = 0
})
afterAll(() => prisma.$disconnect())

async function fixture() {
  const parent = await prisma.fileObject.findFirstOrThrow({ select: { tenantId: true, ownerUserId: true, organizationId: true, departmentId: true } })
  const file = await prisma.fileObject.create({ data: { ...parent, storageKey: `integration/${randomUUID()}`, originalName: 'scan-history-integration.txt', safeName: 'scan-history-integration.txt', sha256, size: BigInt(bytes.length) } })
  fileIds.push(file.id)
  const upload = await prisma.uploadSession.create({ data: { tenantId: file.tenantId, organizationId: file.organizationId, departmentId: file.departmentId, userId: file.ownerUserId, fileId: file.id, objectKey: file.storageKey, fileName: file.originalName, purpose: 'integration-scan-history', fileSize: file.size, chunkSize: bytes.length, totalParts: 1, expiresAt: new Date(scheduled.getTime() + 86400000) } })
  uploadIds.push(upload.id)
  const scans = new FileScanService(prisma as any)
  const enqueue = (key = randomUUID()) => prisma.$transaction(async (tx) => {
    const id = await scans.enqueue(file.id, file.tenantId, { source: 'RESCAN', sourceKey: key, approvalId: key, reason: '集成测试' }, tx)
    await tx.fileScanJob.update({ where: { id }, data: { nextRetryAt: scheduled } })
    return id
  })
  const scoped = prisma.$extends({ query: { fileScanJob: { findFirst({ args, query }) { args.where = { AND: [args.where || {}, { fileId: file.id }] }; return query(args) } } } })
  const traceId = randomUUID(); traces.push(traceId)
  const audit = new AuditService(prisma as any)
  const auditAdapter = { record: (input: any, tx: any) => audit.record({ ...input, traceId }, tx) }
  const storage = { openScanSource: async () => Object.assign(Readable.from([bytes]), { scanIdentity: { ino: 1, dev: 1 } }), publishScannedSource: vi.fn() }
  const outbox = new EventOutboxService(prisma as any, {} as any)
  const createExecutor = (scanner: any = new ClamAvFileScanner(), auditOverride: any = auditAdapter) => new FileScanExecutorService(scoped as any, storage as any, auditOverride, outbox, scanner)
  return { file, enqueue, createExecutor, storage }
}

// These fixtures are uniquely identified test rows. Future scheduling prevents
// application Workers from claiming them; only this scoped test client claims.
describe('scan history MySQL transactions and ClamAV integration', () => {
  it('serializes concurrent triggers into one active job and retains both approvals', async () => {
    const { file, enqueue } = await fixture()
    const ids = await Promise.all([enqueue(), enqueue()])
    expect(ids[0]).toBe(ids[1])
    expect(await prisma.fileScanTrigger.count({ where: { fileId: file.id } })).toBe(2)
    expect(await prisma.fileScanTrigger.count({ where: { fileId: file.id, reused: true } })).toBe(1)
  })
  it('is idempotent for repeated approval execution', async () => {
    const { file, enqueue } = await fixture(); const key = randomUUID()
    expect(await enqueue(key)).toBe(await enqueue(key))
    expect(await prisma.fileScanTrigger.count({ where: { fileId: file.id } })).toBe(1)
  })
  it('persists a real ClamAV result, attempt, file projection and audit atomically', async () => {
    const { file, enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    expect(await createExecutor().processOne()).toBe(true)
    const attempts = await prisma.fileScanAttempt.findMany({ where: { jobId } })
    expect(attempts).toHaveLength(1)
    expect(attempts[0]).toMatchObject({ status: 'SUCCEEDED', verdict: 'CLEAN', policyVersion: 'clamav-instream-v1' })
    expect(attempts[0].scanEngineVersion).toMatch(/^ClamAV \d/)
    expect(await prisma.fileObject.findUnique({ where: { id: file.id } })).toMatchObject({ status: 'READY', latestScanAttemptId: attempts[0].id })
    expect(await prisma.auditLog.count({ where: { traceId: { in: traces } } })).toBe(1)
  })
  it('keeps the failed attempt when retrying successfully', async () => {
    const { enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    await createExecutor({ scan: async () => ({ verdict: 'ERROR', policyVersion: 'policy-old', engineVersion: 'ClamAV 1.0.0' }) }).processOne()
    await prisma.fileScanJob.update({ where: { id: jobId }, data: { nextRetryAt: scheduled } })
    await createExecutor().processOne()
    const attempts = await prisma.fileScanAttempt.findMany({ where: { jobId }, orderBy: { attemptNo: 'asc' } })
    expect(attempts.map((attempt) => attempt.status)).toEqual(['FAILED', 'SUCCEEDED'])
    expect(attempts[0].policyVersion).toBe('policy-old')
  })
  it('recovers an expired lease and prevents the original Worker from committing', async () => {
    const { file, enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    const oldExecutor = createExecutor(); const old = await (oldExecutor as any).claim()
    await prisma.fileScanJob.update({ where: { id: jobId }, data: { leaseExpiresAt: new Date(scheduled.getTime() - 1) } })
    await createExecutor().processOne()
    await expect((oldExecutor as any).settle(old.job, old.attempt.id, old.attempt.startedAt, 'COMMIT', { verdict: 'CLEAN' }, false)).rejects.toThrow()
    const attempts = await prisma.fileScanAttempt.findMany({ where: { jobId }, orderBy: { attemptNo: 'asc' } })
    expect(attempts.map((attempt) => attempt.status)).toEqual(['INTERRUPTED', 'SUCCEEDED'])
    expect((await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).latestScanAttemptId).toBe(attempts[1].id)
  })
  it('rolls back the result, file availability and events if transactional auditing fails', async () => {
    const { file, enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    const brokenAudit = { record: async () => { throw new Error('audit unavailable') } }
    await expect(createExecutor(new ClamAvFileScanner(), brokenAudit).processOne()).rejects.toThrow('audit unavailable')
    expect((await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).status).toBe('QUARANTINED')
    expect((await prisma.fileScanJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('RUNNING')
    expect(await prisma.eventOutbox.count({ where: { aggregateId: { in: uploadIds } } })).toBe(0)
    expect((await prisma.fileScanAttempt.findFirstOrThrow({ where: { jobId } })).status).toBe('RUNNING')
  })
  it('only lets one of two concurrent Workers claim an execution', async () => {
    const { enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    const first = createExecutor(); const second = createExecutor()
    const claims = await Promise.all([(first as any).claim(), (second as any).claim()])
    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(await prisma.fileScanAttempt.count({ where: { jobId } })).toBe(1)
  })
  it('keeps a manual hold after a clean rescan and does not publish the object', async () => {
    const { file, enqueue, createExecutor, storage } = await fixture()
    await prisma.fileObject.update({ where: { id: file.id }, data: { status: 'REJECTED', securityHold: 'MANUAL', securityHoldAt: new Date(), securityHoldReason: '调查中' } })
    await enqueue()
    await createExecutor().processOne()
    expect(await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ status: 'REJECTED', scanStatus: 'CLEAN', securityHold: 'MANUAL', securityHoldReason: '调查中' })
    expect(storage.publishScannedSource).not.toHaveBeenCalled()
  })
  it('only releases a held file after an explicitly executed release approval and a fresh clean scan', async () => {
    const { file, createExecutor, storage } = await fixture()
    await prisma.fileObject.update({ where: { id: file.id }, data: { status: 'REJECTED', securityHold: 'MANUAL', securityHoldReason: '待调查' } })
    const approval = await prisma.approvalRequest.create({ data: {
      tenantId: file.tenantId, requestNo: `TEST-${randomUUID().replace(/-/g, '').slice(0, 15)}`,
      kind: 'FILE_RESCAN', status: 'APPROVED', applicantId: file.ownerUserId,
      payload: { fileId: file.id, releaseReason: '调查确认误报' }, reason: '集成测试安全解除', expiresAt: new Date(scheduled.getTime() + 86400000),
    } })
    approvalIds.push(approval.id)
    const scan = new FileScanService(prisma as any)
    const trigger = { source: 'RESCAN' as const, sourceKey: approval.id, approvalId: approval.id, securityReleaseApprovalId: approval.id, reason: '集成测试安全解除' }
    await expect(prisma.$transaction((tx) => scan.enqueue(file.id, file.tenantId, trigger, tx))).rejects.toThrow('安全解除审批与扫描目标不一致')
    await prisma.approvalRequest.update({ where: { id: approval.id }, data: { status: 'EXECUTED', executedAt: new Date() } })
    const jobId = await prisma.$transaction(async (tx) => {
      const id = await scan.enqueue(file.id, file.tenantId, trigger, tx)
      await tx.fileScanJob.update({ where: { id }, data: { nextRetryAt: scheduled } })
      return id
    })
    await createExecutor().processOne()
    expect(await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).toMatchObject({ status: 'READY', scanStatus: 'CLEAN', securityHold: null, releaseApprovalId: approval.id })
    expect(await prisma.fileScanJob.findUniqueOrThrow({ where: { id: jobId } })).toMatchObject({ securityReleaseApprovalId: approval.id, status: 'SUCCEEDED' })
    expect(storage.publishScannedSource).toHaveBeenCalledTimes(1)
  })
  it('never reactivates a file deleted during scanning', async () => {
    const { file, enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    const executor = createExecutor(); const claimed = await (executor as any).claim()
    await prisma.fileObject.update({ where: { id: file.id }, data: { status: 'DELETED', deletedAt: new Date() } })
    await (executor as any).settle(claimed.job, claimed.attempt.id, claimed.attempt.startedAt, 'COMMIT', { verdict: 'CLEAN', engineVersion: 'ClamAV 1.5.4' }, false)
    expect((await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).status).toBe('DELETED')
    expect((await prisma.fileScanJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('CANCELLED')
  })
  it('does not claim tasks whose retry budget is exhausted', async () => {
    const { enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    await prisma.fileScanJob.update({ where: { id: jobId }, data: { attempts: 5, maxAttempts: 5 } })
    expect(await createExecutor().processOne()).toBe(false)
    expect((await prisma.fileScanJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('DEAD_LETTER')
    expect(await prisma.fileScanAttempt.count({ where: { jobId } })).toBe(0)
  })
  it('retains a clean verdict with the failed publication stage and never makes the file available', async () => {
    const { file, enqueue, createExecutor, storage } = await fixture(); const jobId = await enqueue()
    storage.publishScannedSource.mockRejectedValueOnce(new Error('storage unavailable'))
    await createExecutor().processOne()
    const attempt = await prisma.fileScanAttempt.findFirstOrThrow({ where: { jobId } })
    expect(attempt).toMatchObject({ status: 'FAILED', verdict: 'CLEAN', stage: 'PROMOTE', errorCode: 'SCAN_PROMOTE_FAILED' })
    expect((await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).status).toBe('QUARANTINED')
  })

  it('cancels active scans when a file is administratively rejected and rejects late completion', async () => {
    const { file, enqueue, createExecutor } = await fixture(); const jobId = await enqueue()
    const executor = createExecutor(); const old = await (executor as any).claim()
    await prisma.$transaction(async (tx) => {
      await new FileScanService(prisma as any).cancel(file.id, file.tenantId, tx)
      await tx.fileObject.update({ where: { id: file.id }, data: { status: 'REJECTED', currentScanJobId: null } })
    })
    await expect((executor as any).settle(old.job, old.attempt.id, old.attempt.startedAt, 'COMMIT', { verdict: 'CLEAN' }, false)).rejects.toThrow()
    expect((await prisma.fileObject.findUniqueOrThrow({ where: { id: file.id } })).status).toBe('REJECTED')
    expect((await prisma.fileScanJob.findUniqueOrThrow({ where: { id: jobId } })).status).toBe('CANCELLED')
    expect((await prisma.fileScanAttempt.findFirstOrThrow({ where: { jobId } })).status).toBe('INTERRUPTED')
  })

})
