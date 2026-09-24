import { describe, expect, it, vi } from 'vitest'
import { AuditService } from '../services/audit.service.js'
describe('controlled audit export', () => {
  const range = { from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' }
  it('requires bounded dates before querying', async () => {
    const findMany = vi.fn()
    const service = new AuditService({ auditLog: { findMany } } as any)
    await expect(service.export({ from: 'invalid', to: range.to })).rejects.toThrow()
    await expect(service.export({ from: range.from, to: '2027-01-01' })).rejects.toThrow()
    expect(findMany).not.toHaveBeenCalled()
  })
  it('requires narrower filters instead of silently truncating evidence', async () => {
    const service = new AuditService({
      auditLog: { findMany: vi.fn().mockResolvedValue(Array(1001).fill({})) },
    } as any)
    await expect(service.export(range)).rejects.toThrow('1000')
  })
  it('escapes spreadsheet formulas and quotes', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'id',
        traceId: 'trace',
        createdAt: new Date(range.from),
        actor: { userId: 'u', username: '=HYPERLINK("bad")' },
        action: 'read',
        path: '/audit',
        result: 'SUCCESS',
      },
    ])
    const result = await new AuditService({ auditLog: { findMany } } as any).export(range)
    expect(result.data.content).toContain('"\'=HYPERLINK(""bad"")"')
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 1001,
        where: { createdAt: { gte: new Date(range.from), lte: new Date(range.to) } },
      })
    )
  })
})
