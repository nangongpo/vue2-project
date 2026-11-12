import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { FileScanExecutorService } from '#app/modules/file/file-scan-executor.service.js'
import { FileScanService } from '#app/modules/file/file-scan.service.js'

function setup(verdict: 'CLEAN' | 'INFECTED' | 'ERROR', securityHold: string | null = null, release = false) {
  const file = { id: 'file', tenantId: 'tenant', status: 'QUARANTINED', securityHold, currentScanJobId: 'job', sha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', size: 4n, storageKey: 'key' }
  const prisma = {
    $queryRaw: vi.fn(),
    fileObject: { findFirst: vi.fn().mockResolvedValue(file), update: vi.fn() },
    fileScanAttempt: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    fileScanJob: { updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
    uploadSession: { findFirst: vi.fn().mockResolvedValue({ id: 'upload', userId: 'user' }), findMany: vi.fn().mockResolvedValue([{ id: 'upload', userId: 'user' }]), update: vi.fn() },
    $transaction: vi.fn(async (callback) => callback(prisma)),
  }
  const storage = { openScanSource: vi.fn().mockResolvedValue(Object.assign(Readable.from([Buffer.from('test')]), { scanIdentity: { ino: 1, dev: 1 } })), publishScannedSource: vi.fn() }
  const audit = { record: vi.fn() }; const outbox = { enqueue: vi.fn() }
  const scanner = { scan: vi.fn(async (input) => { await input.onStage('SCAN'); for await (const chunk of input.stream) { void chunk } return { verdict, detail: 'result', engineVersion: 'ClamAV 1.4.3', policyVersion: 'clamav-instream-v1' } }) }
  const executor = new FileScanExecutorService(prisma as any, storage as any, audit as any, outbox as any, scanner)
  vi.spyOn(executor as any, 'claim').mockResolvedValue({ job: { id: 'job', fileId: 'file', tenantId: 'tenant', sha256: file.sha256, size: file.size, attempts: 1, maxAttempts: 3, leaseToken: 'lease', securityReleaseApprovalId: release ? 'approval' : null }, attempt: { id: 'attempt', startedAt: new Date() }, file })
  return { executor, prisma, storage, audit }
}

describe('scan history version persistence', () => {
  it('keeps a held file quarantined while an engine failure is being retried', async () => {
    const { executor, prisma } = setup('ERROR', 'MANUAL')
    await executor.processOne()
    expect(prisma.fileObject.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'QUARANTINED', scanStatus: 'ERROR' }) }))
    expect(prisma.fileScanJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING' }) }))
    expect(prisma.uploadSession.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: 'SCANNING' } }))
  })
  it('clears a hold only after a clean scan with explicit release approval', async () => {
    const { executor, prisma, storage } = setup('CLEAN', 'MANUAL', true)
    await executor.processOne()
    expect(storage.publishScannedSource).toHaveBeenCalledTimes(1)
    expect(prisma.fileObject.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'READY', securityHold: null, releaseApprovalId: 'approval' }) }))
  })
  it('retains a hold when an approved release scan still detects malware', async () => {
    const { executor, prisma, storage } = setup('INFECTED', 'MANUAL', true)
    await executor.processOne()
    expect(storage.publishScannedSource).not.toHaveBeenCalled()
    const data = prisma.fileObject.update.mock.calls[0][0].data
    expect(data.status).toBe('REJECTED')
    expect(data).not.toHaveProperty('securityHold', null)
  })
  it.each(['CLEAN', 'INFECTED', 'ERROR'] as const)('persists versions and an independent attempt for %s', async (verdict) => {
    const { executor, prisma, storage, audit } = setup(verdict)
    await executor.processOne()
    expect(prisma.fileScanAttempt.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ verdict, scanEngineVersion: 'ClamAV 1.4.3', policyVersion: 'clamav-instream-v1' }) }))
    expect(storage.publishScannedSource).toHaveBeenCalledTimes(verdict === 'CLEAN' ? 1 : 0)
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), prisma)
  })

  it('clears old versions only for a newly queued task', async () => {
    const prisma = { $queryRaw: vi.fn(), fileObject: { findFirst: vi.fn().mockResolvedValue({ id: 'file', status: 'READY', sha256: 'a'.repeat(64), size: 4n }), update: vi.fn() }, fileScanTrigger: { findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() }, fileScanJob: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue({ id: 'job' }) } }
    const service = new FileScanService(prisma as any)
    await service.enqueue('file', 'tenant', { source: 'UPLOAD', sourceKey: 'source', reason: '上传' }, prisma as any)
    expect(prisma.fileObject.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ currentScanJobId: 'job', scanEngineVersion: null, policyVersion: null }) }))
  })
  it('rejects stale leases before committing any file state', async () => {
    const { executor, prisma } = setup('CLEAN')
    prisma.fileScanJob.updateMany.mockResolvedValue({ count: 0 })
    await executor.processOne()
    expect(prisma.fileObject.update).not.toHaveBeenCalled()
  })
})
