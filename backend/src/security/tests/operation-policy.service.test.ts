import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { OperationPolicyService } from '#app/security/services/operation-policy.service.js'

function makeService(findFirst: unknown = null) {
  const prisma = {
      operationPolicy: {
        findFirst: vi.fn().mockResolvedValue(findFirst),
        findMany: vi.fn().mockResolvedValue([]),
      },
  } as any
  return { service: new OperationPolicyService(prisma), prisma }
}

describe('OperationPolicyService', () => {
  it('uses the code-owned baseline for built-in system operations', async () => {
    const { service } = makeService()
    await expect(service.resolve('system.role.grant')).resolves.toMatchObject({
      operationCode: 'system.role.grant',
      riskLevel: 'L3',
      requireMfa: true,
      requireReauth: true,
      requireApproval: true,
      requireDualControl: true,
      auditRequired: true,
    })
  })

  it('resolves data-scope operations from the code-owned security baseline', async () => {
    const { service } = makeService()
    await expect(service.resolve('system.data-scope.read', ['system.data-scope.read'])).resolves.toMatchObject({
      operationCode: 'system.data-scope.read',
      riskLevel: 'L2',
      requireMfa: true,
      requireReauth: true,
      requireApproval: false,
      auditRequired: true,
    })
  })

  it('fails closed for an unregistered business operation', async () => {
    const { service } = makeService()
    await expect(service.resolve('order.refund')).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('rejects an active policy that lowers a built-in control', async () => {
    const { service } = makeService({
      operationCode: 'system.role.grant',
      minimumRiskLevel: 'L3',
      riskLevel: 'L3',
      requireMfa: true,
      requireReauth: true,
      requireApproval: true,
      requireDualControl: false,
      auditRequired: true,
    })
    await expect(service.resolve('system.role.grant')).rejects.toBeInstanceOf(ServiceUnavailableException)
  })

  it('exposes only read-only operation policy catalog entries', async () => {
    const { service } = makeService()
    const result = await service.catalog()
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationCode: 'system.role.grant', source: 'CODE_BASELINE' }),
      expect.objectContaining({ operationCode: 'system.operation-policy.read', source: 'CODE_BASELINE' }),
    ]))
    expect(result.map((item) => item.operationCode)).not.toEqual(expect.arrayContaining([
      'system.operation-policy.create',
      'system.operation-policy.activate',
      'system.operation-policy.status',
    ]))
  })
})
