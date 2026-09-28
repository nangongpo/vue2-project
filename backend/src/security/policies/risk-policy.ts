import { ForbiddenException } from '@nestjs/common'
import { API_CODE } from '#app/common/constants/api-code.js'
import { API_BY_CODE, BUSINESS_API_CODES, SYSTEM_API_CODES } from '#app/security/policies/permission-catalog/index.js'
import { getBuiltInOperation } from '#app/security/policies/operation-catalog.js'
import type { RiskLevel } from '#app/common/types/prisma-enums.js'

export type { RiskLevel }
export type RiskDecisionSource = 'SYSTEM_CATALOG' | 'BUSINESS_CATALOG' | 'SECURITY_OPERATION' | 'DATABASE'

export type RiskDecision = {
  operationCode: string
  resource: string
  action: string
  riskLevel: RiskLevel
  requireMfa: boolean
  requireReauth: boolean
  requireApproval: boolean
  requireDualControl: boolean
  auditRequired: boolean
  source: RiskDecisionSource
}

export type RiskContext = {
  fieldRiskLevels?: readonly RiskLevel[]
  targetRiskLevel?: RiskLevel
  requireApproval?: boolean
  requireDualControl?: boolean
  auditRequired?: true
  minimumLevel?: RiskLevel
}

export type SecurityProofActor = {
  mfaVerifiedAt?: Date | null
  reauthenticatedAt?: Date | null
}

export const RISK_POLICY = {
  L0: { requireMfa: false, requireReauth: false, requireApproval: false, auditRequired: true },
  L1: { requireMfa: false, requireReauth: false, requireApproval: false, auditRequired: true },
  L2: { requireMfa: true, requireReauth: true, requireApproval: false, auditRequired: true },
  L3: { requireMfa: true, requireReauth: true, requireApproval: true, auditRequired: true },
} as const

export const RISK_PROOF_TTL_MS = 5 * 60 * 1000
const riskOrder: Record<RiskLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 }

export function maxRiskLevel(...levels: RiskLevel[]): RiskLevel {
  return levels.reduce(
    (highest, level) => (riskOrder[level] > riskOrder[highest] ? level : highest),
    'L0' as RiskLevel,
  )
}

function sourceFor(operationCode: string): RiskDecisionSource {
  if (SYSTEM_API_CODES.has(operationCode)) return 'SYSTEM_CATALOG'
  if (BUSINESS_API_CODES.has(operationCode)) return 'BUSINESS_CATALOG'
  return 'SECURITY_OPERATION'
}

function codeBaseline(operationCode: string): RiskDecision {
  const api = API_BY_CODE.get(operationCode)
  if (api) return { operationCode, resource: api.resource, action: api.action, ...api.riskBaseline, source: sourceFor(operationCode) }
  const operation = getBuiltInOperation(operationCode)
  if (operation?.resource && operation.action)
    return { ...operation, operationCode, resource: operation.resource, action: operation.action, source: 'SECURITY_OPERATION' }
  throw new ForbiddenException(`安全操作 ${operationCode} 未登记代码基线`)
}

/** Resolve one operation from the code-owned catalog and apply explicit context elevations. */
export function resolveRiskDecision(operationCode: string, context: RiskContext = {}): RiskDecision {
  const baseline = codeBaseline(operationCode)
  const riskLevel = maxRiskLevel(
    baseline.riskLevel,
    ...(context.fieldRiskLevels || []),
    context.targetRiskLevel || 'L0',
    context.minimumLevel || 'L0',
  )
  const controls = RISK_POLICY[riskLevel]
  return {
    ...baseline,
    riskLevel,
    requireMfa: baseline.requireMfa || controls.requireMfa,
    requireReauth: baseline.requireReauth || controls.requireReauth,
    requireApproval: baseline.requireApproval || controls.requireApproval || Boolean(context.requireApproval),
    requireDualControl: baseline.requireDualControl || Boolean(context.requireDualControl),
    auditRequired: baseline.auditRequired || controls.auditRequired || context.auditRequired === true,
  }
}

export function assertOperationSecurityProof(actor: SecurityProofActor, decision: RiskDecision, now = new Date()) {
  return assertRecentSecurityProof(actor, decision.riskLevel, now)
}

export function assertRecentSecurityProof(actor: SecurityProofActor, level: RiskLevel, now = new Date()) {
  const policy = RISK_POLICY[level]
  if (!policy.requireMfa && !policy.requireReauth) return
  if (hasRecentSecurityProof(actor, level, now)) return
  throw new ForbiddenException(`${level} 操作需要五分钟内完成 MFA 和重新认证`)
}

export function securityStepUpException(actor: SecurityProofActor, decision: RiskDecision) {
  return new ForbiddenException({
    code: API_CODE.SECURITY_STEP_UP_REQUIRED,
    message: '需要完成高风险操作验证',
    data: {
      ...decision,
      requiredFactors: (actor as SecurityProofActor & { mfaEnabled?: boolean }).mfaEnabled
        ? ['PASSWORD', 'OTP']
        : ['PASSWORD'],
    },
  })
}

export function hasRecentSecurityProof(actor: SecurityProofActor, level: RiskLevel, now = new Date()) {
  const policy = RISK_POLICY[level]
  if (!policy.requireMfa && !policy.requireReauth) return true
  const recent = (value?: Date | null) =>
    value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() <= now.getTime() && now.getTime() - value.getTime() <= RISK_PROOF_TTL_MS
  return recent(actor.mfaVerifiedAt) && recent(actor.reauthenticatedAt)
}
