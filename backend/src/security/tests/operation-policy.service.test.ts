import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common'
import { OperationPolicyService } from '../services/operation-policy.service.js'

function makeService(findFirst: unknown = null) {
  const prisma = {
    operationPolicy: {
      findFirst: vi.fn().mockResolvedValue(findFirst),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'policy-id' }),
      findUnique: vi.fn(),
      update: vi.fn(),
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

  it('rejects a policy that tries to lower a built-in risk baseline', async () => {
    const { service } = makeService()
    await expect(service.create({
      operationCode: 'system.role.grant',
      name: '授予角色权限',
      resource: 'system.role',
      action: 'grant',
      riskLevel: 'L2',
    })).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('defaults L3 business controls to MFA, reauth, approval and audit', async () => {
    const { service, prisma } = makeService()
    await service.create({
      operationCode: 'order.refund',
      name: '订单退款',
      resource: 'order',
      action: 'refund',
      riskLevel: 'L3',
    })
    expect(prisma.operationPolicy.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requireMfa: true,
        requireReauth: true,
        requireApproval: true,
        requireDualControl: false,
        auditRequired: true,
      }),
    }))
  })

  it('merges code baselines and database policies into one catalog', async () => {
    const { service } = makeService()
    const result = await service.catalog()
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ operationCode: 'system.role.grant', source: 'CODE_BASELINE' }),
    ]))
  })
})
