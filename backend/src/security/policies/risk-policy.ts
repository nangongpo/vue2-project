import { ForbiddenException } from '@nestjs/common'
import { getBuiltInOperation } from './operation-catalog.js'

export type RiskLevel = 'L0' | 'L1' | 'L2' | 'L3'

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
    'L0' as RiskLevel
  )
}

type RiskRule = {
  level: RiskLevel
  exact?: readonly string[]
  prefixes?: readonly string[]
  actions?: readonly string[]
}

/**
 * 权限码的保守兜底规则。业务操作不能依赖这里确定最终风险，
 * 必须通过内置目录或数据库 OperationPolicy 显式登记。
 */
const PERMISSION_RISK_RULES: readonly RiskRule[] = [
  { level: 'L0', actions: ['read', 'detail', 'options', 'list', 'status'] },
  // The field-security interceptor raises this baseline according to the
  // actual changed fields. A label/sort-only button update is therefore L1;
  // name/status/API changes still become L3 at the field boundary.
  { level: 'L1', exact: ['system.button.update'] },
  { level: 'L3', prefixes: ['system.approval.', 'system.ops-ticket.', 'data-scope.'] },
  {
    level: 'L3',
    prefixes: [
      'system.role.',
      'system.permission.',
      'system.page.',
      'system.button.',
      'system.permission.field.',
      'system.api.',
      'system.data.',
      'system.operation-policy.',
    ],
  },
  {
    level: 'L3',
    exact: [
      'system.user.grant',
      'system.user.disable',
      'system.user.unlock',
      'system.user.reset-password',
      'system.user.mfa-reset',
    ],
  },
  {
    level: 'L2',
    prefixes: ['system.session.', 'system.auth.', 'auth.password.', 'auth.mfa.', 'auth.reauth.'],
  },
  { level: 'L2', prefixes: ['system.'] },
]

function fallbackPermissionRisk(permission: string): RiskLevel {
  if (!permission) return 'L0'
  const action = permission.split('.').at(-1)
  for (const rule of PERMISSION_RISK_RULES) {
    if (rule.exact?.includes(permission)) return rule.level
    if (rule.prefixes?.some((prefix) => permission.startsWith(prefix))) return rule.level
    if (action && rule.actions?.includes(action)) return rule.level
  }
  return 'L1'
}

/** Permission-code risk fallback. Prefer an explicit operation policy for business actions. */
export function riskLevelForPermission(permission: string): RiskLevel {
  return fallbackPermissionRisk(permission)
}

/**
 * Resolve an operation's code baseline. Explicit system operations come from
 * the code-owned catalog; unregistered business operations remain only a
 * conservative fallback for audit/error paths and are rejected by the policy service.
 */
export function riskLevelForOperation(operation: string): RiskLevel {
  return getBuiltInOperation(operation)?.riskLevel || fallbackPermissionRisk(operation)
}

export function resolveRiskLevel(input: {
  permissions?: string[]
  operation?: string
  minimumLevel?: RiskLevel
}): RiskLevel {
  return maxRiskLevel(
    ...(input.permissions || []).map(riskLevelForPermission),
    input.operation ? riskLevelForOperation(input.operation) : 'L0',
    input.minimumLevel || 'L0'
  )
}

export function assertOperationSecurityProof(
  actor: SecurityProofActor,
  operation: string,
  now = new Date()
) {
  return assertRecentSecurityProof(actor, riskLevelForOperation(operation), now)
}

export function highestRiskLevel(permissions: string[]): RiskLevel {
  return permissions.reduce<RiskLevel>((highest, permission) => {
    return maxRiskLevel(highest, riskLevelForPermission(permission))
  }, 'L0')
}

export function assertRecentSecurityProof(
  actor: SecurityProofActor,
  level: RiskLevel,
  now = new Date()
) {
  if (hasRecentSecurityProof(actor, level, now)) return
  const policy = RISK_POLICY[level]
  if (!policy.requireMfa && !policy.requireReauth) return
  throw new ForbiddenException(`${level} 操作需要五分钟内完成 MFA 和重新认证`)
}

export function hasRecentSecurityProof(
  actor: SecurityProofActor,
  level: RiskLevel,
  now = new Date()
) {
  const policy = RISK_POLICY[level]
  if (!policy.requireMfa && !policy.requireReauth) return true
  const recent = (value?: Date | null) =>
    value instanceof Date &&
    Number.isFinite(value.getTime()) &&
    value.getTime() <= now.getTime() &&
    now.getTime() - value.getTime() <= RISK_PROOF_TTL_MS
  return recent(actor.mfaVerifiedAt) && recent(actor.reauthenticatedAt)
}
