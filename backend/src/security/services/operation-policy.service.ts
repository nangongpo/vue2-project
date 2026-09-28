import { Injectable, ServiceUnavailableException } from '@nestjs/common'
import { OperationPolicyStatus } from '#app/common/types/prisma-enums.js'
import { PrismaService } from '#app/database/prisma.service.js'
import { maxRiskLevel, resolveRiskDecision, type RiskDecision, type RiskLevel } from '#app/security/policies/risk-policy.js'
import { BUILT_IN_OPERATION_CATALOG, getBuiltInOperation, materializeOperation } from '#app/security/policies/operation-catalog.js'
import { allApiDefinitions } from '#app/security/policies/permission-catalog/index.js'

function baselineFor(operationCode: string, permissionRisk: RiskLevel = 'L0') {
  return resolveRiskDecision(operationCode, { minimumLevel: permissionRisk })
}

function assertControlsAtLeast(actual: {
  requireMfa: boolean
  requireReauth: boolean
  requireApproval: boolean
  requireDualControl: boolean
  auditRequired: boolean
  }, baseline: RiskDecision, errorMessage: string) {
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
      ? permissionCodes.reduce<RiskLevel>((highest, permission) => maxRiskLevel(highest, resolveRiskDecision(permission).riskLevel), 'L0')
      : 'L0'
    const baseline = baselineFor(operationCode, permissionRisk)
    if (!policy) {
      return {
        ...baseline,
        minimumRiskLevel: baseline.riskLevel,
        status: OperationPolicyStatus.ACTIVE,
        version: 1,
      }
    }

    const configuredMinimum = policy.minimumRiskLevel as RiskLevel
    const minimum = maxRiskLevel(baseline.riskLevel, configuredMinimum)
    if (policy.resource !== baseline.resource || policy.action !== baseline.action)
      throw new ServiceUnavailableException('业务操作策略的 resource/action 与代码目录不一致')
    const configuredRisk = policy.riskLevel as RiskLevel
    if (maxRiskLevel(configuredRisk, minimum) !== configuredRisk) {
      throw new ServiceUnavailableException('业务操作风险策略低于系统安全基线')
    }
    const controls = baselineFor(operationCode, maxRiskLevel(permissionRisk, configuredRisk))
    assertControlsAtLeast(policy, controls, '业务操作安全控制低于系统安全基线')
    const effectiveRiskLevel = maxRiskLevel(configuredRisk, permissionRisk)
    return { ...policy, ...controls, riskLevel: effectiveRiskLevel, minimumRiskLevel: minimum, source: 'DATABASE' as const }
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
    const apiBuiltIns = allApiDefinitions().map((definition) => ({
      operationCode: definition.code,
      name: definition.name,
      resource: definition.resource,
      action: definition.action,
      ...definition.riskBaseline,
      source: 'CODE_BASELINE' as const,
      policy: byCode.get(definition.code) || null,
    }))
    const securityBuiltIns = BUILT_IN_OPERATION_CATALOG.map((definition) => ({
      ...materializeOperation(definition),
      source: 'CODE_BASELINE' as const,
      policy: byCode.get(definition.operationCode) || null,
    }))
    const databaseOnly = policies
      .filter((policy) => !getBuiltInOperation(policy.operationCode))
      .map((policy) => ({
        ...policy,
        source: 'DATABASE' as const,
      }))
    return [...apiBuiltIns, ...securityBuiltIns, ...databaseOnly]
  }

}
