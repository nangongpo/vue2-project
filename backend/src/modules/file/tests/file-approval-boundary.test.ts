import { describe, expect, it, vi } from 'vitest'
import { ApprovalService } from '#app/modules/permission/services/approval.service.js'

describe('file approval target data scope', () => {
  it('rejects a target outside system.file scope before loading its snapshot', async () => {
    const prisma = { fileObject: { findFirst: vi.fn().mockResolvedValue(null) }, $queryRaw: vi.fn() }
    const scopes = { where: vi.fn().mockResolvedValue({ tenantId: 'tenant', ownerUserId: 'allowed-owner' }) }
    const service = new ApprovalService(prisma as any, undefined, scopes as any)
    const actor = { internalId: 1n, tenantId: 'tenant' }
    await expect((service as any).validateTarget(prisma, 'FILE_DELETE', { fileId: 'outside-file', targetSnapshot: 'a'.repeat(64) }, [], 'tenant', actor)).rejects.toThrow('目标文件不存在')
    expect(scopes.where).toHaveBeenCalledWith(actor, 'system.file', prisma)
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
})
