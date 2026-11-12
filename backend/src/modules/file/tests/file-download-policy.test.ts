import { describe, expect, it, vi } from 'vitest'
import { FileService } from '#app/modules/file/file.service.js'

describe('file download security classification boundary', () => {
  it.each(['CONFIDENTIAL', 'UNKNOWN'])('does not open content without a registered %s download policy', async (classification) => {
    const prisma = { $transaction: vi.fn().mockResolvedValue('owner'),
      fileObject: { findFirst: vi.fn().mockResolvedValue({ storageKey: 'private-key', classification }) } }
    const storage = { readObject: vi.fn() }
    const service = new FileService(prisma as any, storage as any, {} as any, {} as any, {} as any)
    await expect(service.download('file', { tenantId: 'tenant' } as any)).rejects.toThrow('禁止下载')
    expect(storage.readObject).not.toHaveBeenCalled()
    expect(prisma.fileObject.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant', ownerUserId: 'owner', status: 'READY', scanStatus: 'CLEAN', securityHold: null }) }))
  })
})
