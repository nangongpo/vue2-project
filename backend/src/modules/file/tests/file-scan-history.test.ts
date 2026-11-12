import { describe, expect, it, vi } from 'vitest'
import { FileScanHistoryService } from '#app/modules/file/file-scan-history.service.js'
const actor = { tenantId: 'tenant', userId: 'user' } as any
function setup() {
  const prisma = { fileObject: { findFirst: vi.fn().mockResolvedValue({ id: 'file' }) }, fileScanJob: { findFirst: vi.fn().mockResolvedValue(null), count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([{ id: 'job', tenantId: 'secret', leaseToken: 'secret', status: 'RUNNING', attempts: 1, historyAvailable: true }]) }, $transaction: vi.fn(async (tasks) => Promise.all(tasks)) }
  const scopes = { where: vi.fn().mockResolvedValue({ ownerUserId: 'user' }) }
  return { prisma, service: new FileScanHistoryService(prisma as any, scopes as any) }
}
describe('scan history data boundary', () => {
  it('rejects a hidden parent file before querying any job', async () => {
    const { prisma, service } = setup(); prisma.fileObject.findFirst.mockResolvedValue(null as any)
    await expect(service.page('file', {}, actor)).rejects.toThrow('文件不存在')
    expect(prisma.fileScanJob.findMany).not.toHaveBeenCalled()
  })
  it('constrains approval filtering to the authorized file and tenant without exposing locks', async () => {
    const { prisma, service } = setup(); const result = await service.page('file', { approvalId: 'approval' }, actor)
    expect(prisma.fileScanJob.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { fileId: 'file', tenantId: 'tenant', triggers: { some: { fileId: 'file', tenantId: 'tenant', approvalId: 'approval' } } } }))
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(result.data.items[0].isTerminal).toBe(false)
  })
  it('rejects attempts requested through a mismatched parent job', async () => {
    const { service, prisma } = setup()
    await expect(service.attempts('file', 'other-job', {}, actor)).rejects.toThrow('扫描任务不存在')
    expect(prisma.fileScanJob.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'other-job', fileId: 'file', tenantId: 'tenant' } }))
  })
})
