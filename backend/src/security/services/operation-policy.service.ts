import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common'
import { OperationPolicyStatus, RiskLevel as PrismaRiskLevel } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service.js'
import { maxRiskLevel, riskLevelForOperation, RISK_POLICY, type RiskLevel } from '../policies/risk-policy.js'
import { BUILT_IN_OPERATION_CATALOG, getBuiltInOperation } from '../policies/operation-catalog.js'

function controlsForRisk(level: RiskLevel) {
  const policy = RISK_POLICY[level]
  return {
    requireMfa: policy.requireMfa,
    requireReauth: policy.requireReauth,
    requireApproval: policy.requireApproval,
    requireDualControl: false,
    auditRequired: policy.auditRequired,
  }
}

function baselineFor(operationCode: string, permissionRisk: RiskLevel = 'L0') {
  const builtIn = getBuiltInOperation(operationCode)
  const codeMinimum = builtIn?.riskLevel || riskLevelForOperation(operationCode)
  const riskLevel = maxRiskLevel(codeMinimum, permissionRisk)
  const riskControls = controlsForRisk(riskLevel)
  return {
    riskLevel,
    requireMfa: riskControls.requireMfa || Boolean(builtIn?.requireMfa),
    requireReauth: riskControls.requireReauth || Boolean(builtIn?.requireReauth),
    requireApproval: riskControls.requireApproval || Boolean(builtIn?.requireApproval),
    requireDualControl: Boolean(builtIn?.requireDualControl),
    auditRequired: riskControls.auditRequired || Boolean(builtIn?.auditRequired),
  }
}

function assertControlsAtLeast(actual: {
  requireMfa: boolean
  requireReauth: boolean
  requireApproval: boolean
  requireDualControl: boolean
  auditRequired: boolean
}, baseline: ReturnType<typeof baselineFor>, errorMessage: string) {
  if (
    (baseline.requireMfa && !actual.requireMfa) ||
    (baseline.requireReauth && !actual.requireReauth) ||
    (baseline.requireApproval && !actual.requireApproval) ||
    (baseline.requireDualControl && !actual.requireDualControl) ||
    (baseline.auditRequired && !actual.auditRequired)
  ) throw new ServiceUnavailableException(errorMessage)
}

@Injectable()
export class OperationPolicyService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(operationCode: string, permissionCodes: string[] = []) {
    const policy = await this.prisma.operationPolicy.findFirst({
      where: { operationCode, status: OperationPolicyStatus.ACTIVE },
    })
    const permissionRisk = permissionCodes.length
      ? permissionCodes.reduce<RiskLevel>((highest, permission) => maxRiskLevel(highest, riskLevelForOperation(permission)), 'L0')
      : 'L0'
    const baseline = baselineFor(operationCode, permissionRisk)
    if (!policy) {
      const builtIn = getBuiltInOperation(operationCode)
      if (!builtIn) throw new ForbiddenException('业务操作风险策略尚未登记或发布')
      return {
        ...builtIn,
        ...baseline,
        minimumRiskLevel: builtIn.riskLevel,
        status: OperationPolicyStatus.ACTIVE,
        version: 1,
      }
    }

    const configuredMinimum = policy.minimumRiskLevel as RiskLevel
    const minimum = maxRiskLevel(baseline.riskLevel, configuredMinimum)
    const configuredRisk = policy.riskLevel as RiskLevel
    if (maxRiskLevel(configuredRisk, minimum) !== configuredRisk) {
      throw new ServiceUnavailableException('业务操作风险策略低于系统安全基线')
    }
    const controls = baselineFor(operationCode, maxRiskLevel(permissionRisk, configuredRisk))
    assertControlsAtLeast(policy, controls, '业务操作安全控制低于系统安全基线')
    const effectiveRiskLevel = maxRiskLevel(configuredRisk, permissionRisk)
    return { ...policy, ...controls, riskLevel: effectiveRiskLevel, minimumRiskLevel: minimum }
  }

  async list(status?: OperationPolicyStatus) {
    return this.prisma.operationPolicy.findMany({
      where: status ? { status } : undefined,
      orderBy: [{ status: 'asc' }, { operationCode: 'asc' }],
    })
  }

  /**
   * 返回管理端可见的完整策略目录：代码基线和数据库策略合并展示。
   * 代码基线不是可编辑配置，数据库记录只表示业务登记或对内置操作的增强策略。
   */
  async catalog(status?: OperationPolicyStatus) {
    const policies = await this.list(status)
    const byCode = new Map(policies.map((policy) => [policy.operationCode, policy]))
    const builtIns = BUILT_IN_OPERATION_CATALOG.map((definition) => ({
      ...definition,
      source: 'CODE_BASELINE' as const,
      policy: byCode.get(definition.operationCode) || null,
    }))
    const databaseOnly = policies
      .filter((policy) => !getBuiltInOperation(policy.operationCode))
      .map((policy) => ({
        ...policy,
        source: 'DATABASE' as const,
      }))
    return [...builtIns, ...databaseOnly]
  }

  async create(input: {
    operationCode: string
    name: string
    resource: string
    action: string
    riskLevel: PrismaRiskLevel
    minimumRiskLevel?: PrismaRiskLevel
    requireMfa?: boolean
    requireReauth?: boolean
    requireApproval?: boolean
    requireDualControl?: boolean
    auditRequired?: boolean
    reason?: string
  }) {
    const minimumRiskLevel = maxRiskLevel(getBuiltInOperation(input.operationCode)?.riskLevel || riskLevelForOperation(input.operationCode), input.minimumRiskLevel || 'L0') as PrismaRiskLevel
    if (maxRiskLevel(input.riskLevel, minimumRiskLevel) !== input.riskLevel)
      throw new ForbiddenException('业务操作风险等级不能低于系统安全基线')
    const controls = baselineFor(input.operationCode, input.riskLevel)
    if (
      (controls.requireMfa && input.requireMfa === false) ||
      (controls.requireReauth && input.requireReauth === false) ||
      (controls.requireApproval && input.requireApproval === false) ||
      (controls.requireDualControl && input.requireDualControl === false) ||
      (controls.auditRequired && input.auditRequired === false)
    )
      throw new ForbiddenException('业务操作安全控制不能低于系统安全基线')
    try {
      return await this.prisma.operationPolicy.create({
        data: {
          ...input,
          requireMfa: input.requireMfa ?? controls.requireMfa,
          requireReauth: input.requireReauth ?? controls.requireReauth,
          requireApproval: input.requireApproval ?? controls.requireApproval,
          requireDualControl: input.requireDualControl ?? controls.requireDualControl,
          auditRequired: input.auditRequired ?? controls.auditRequired,
          minimumRiskLevel,
          status: OperationPolicyStatus.DRAFT,
        },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('业务操作标识已存在')
      throw error
    }
  }

  async activate(id: string) {
    const policy = await this.prisma.operationPolicy.findUnique({ where: { id } })
    if (!policy) throw new NotFoundException('业务操作策略不存在')
    const minimumRiskLevel = maxRiskLevel(getBuiltInOperation(policy.operationCode)?.riskLevel || riskLevelForOperation(policy.operationCode), policy.minimumRiskLevel as RiskLevel) as PrismaRiskLevel
    if (maxRiskLevel(policy.riskLevel as RiskLevel, minimumRiskLevel) !== policy.riskLevel)
      throw new ForbiddenException('业务操作风险等级不能低于系统安全基线')
    const controls = baselineFor(policy.operationCode, policy.riskLevel as RiskLevel)
    assertControlsAtLeast(policy, controls, '业务操作安全控制低于系统安全基线')
    return this.prisma.operationPolicy.update({
      where: { id },
      data: { status: OperationPolicyStatus.ACTIVE, minimumRiskLevel, version: { increment: 1 } },
    })
  }

  async disable(id: string) {
    try {
      return await this.prisma.operationPolicy.update({
        where: { id },
        data: { status: OperationPolicyStatus.DISABLED, version: { increment: 1 } },
      })
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') throw new NotFoundException('业务操作策略不存在')
      throw error
    }
  }
}
