import { describe, expect, it, vi } from 'vitest'
import { AuditService } from '../services/audit.service.js'

describe('AuditService', () => {
  it('writes an integrity hash for every new audit record', async () => {
    const originalSecret = process.env.AUDIT_INTEGRITY_SECRET
    process.env.AUDIT_INTEGRITY_SECRET = 'audit-test-secret-01234567890123456789'
    const create = vi.fn().mockResolvedValue(undefined)
    const service = new AuditService({ auditLog: { create } } as any)

    try {
      await service.record({
        traceId: 'trace-1',
        action: 'users.list',
        resource: 'users',
        method: 'GET',
        path: '/api/v1/users',
        result: 'SUCCESS',
        statusCode: 200,
      })
    } finally {
      if (originalSecret === undefined) delete process.env.AUDIT_INTEGRITY_SECRET
      else process.env.AUDIT_INTEGRITY_SECRET = originalSecret
    }

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ integrityHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      })
    )
  })

  it('does not expose internal BigInt actorId in audit detail', async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: 'log-1',
      traceId: 'trace-1',
      action: 'audit.logs.detail',
      resource: 'audit-log',
      method: 'GET',
      path: '/api/v1/audit-logs/log-1',
      result: 'SUCCESS',
      statusCode: 200,
      ip: null,
      userAgent: null,
      detail: { ok: true },
      createdAt: new Date(),
      actor: { userId: 'public-user-1', username: 'admin', displayName: '管理员' },
    })
    const prisma = { auditLog: { findUnique } } as any
    const service = new AuditService(prisma)

    const result = await service.detail('log-1')

    expect(result.data).not.toHaveProperty('actorId')
    expect(result.data.actor).toEqual({
      userId: 'public-user-1',
      username: 'admin',
      displayName: '管理员',
    })
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({ select: expect.objectContaining({ actor: expect.anything() }) }))
  })

  it('rejects a digest recomputed without the server secret', async () => {
    const originalSecret = process.env.AUDIT_INTEGRITY_SECRET
    process.env.AUDIT_INTEGRITY_SECRET = 'audit-test-secret-01234567890123456789'
    const findUnique = vi.fn().mockResolvedValue({
      id: 'log-1',
      traceId: 'trace-1',
      actorId: null,
      action: 'users.list',
      operationCode: null,
      riskLevel: 'L1',
      resource: 'users',
      method: 'GET',
      path: '/api/v1/users',
      result: 'SUCCESS',
      statusCode: 200,
      ip: null,
      userAgent: null,
      detail: null,
      createdAt: new Date('2026-09-27T00:00:00.000Z'),
      integrityHash: '8'.repeat(64),
    })
    try {
      const result = await new AuditService({ auditLog: { findUnique } } as any).verify('log-1')
      expect(result.data).toMatchObject({ valid: false, algorithm: 'HMAC-SHA256' })
    } finally {
      if (originalSecret === undefined) delete process.env.AUDIT_INTEGRITY_SECRET
      else process.env.AUDIT_INTEGRITY_SECRET = originalSecret
    }
  })

  it('returns a paginated audit result with filters', async () => {
    const count = vi.fn().mockResolvedValue(1)
    const findMany = vi.fn().mockResolvedValue([{ id: 'log-1' }])
    const prisma = {
      auditLog: { count, findMany },
      $transaction: (queries: Promise<unknown>[]) => Promise.all(queries),
    } as any
    const service = new AuditService(prisma)
    const from = new Date('2026-09-01T00:00:00.000Z')

    const result = await service.page({
      keyword: 'users',
      result: 'FAILURE',
      from,
      page: 2,
      pageSize: 10,
    })

    expect(result.data).toEqual({ items: [{ id: 'log-1' }], total: 1, page: 2, pageSize: 10, totalPages: 1 })
    expect(count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ result: 'FAILURE', createdAt: { gte: from } }),
      })
    )
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10, orderBy: { createdAt: 'desc' } }))
  })
})
