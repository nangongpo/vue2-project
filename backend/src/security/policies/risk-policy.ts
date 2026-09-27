import { ForbiddenException } from '@nestjs/common'
import { getBuiltInOperation } from './operation-catalog.js'
import { API_CODE } from '../../common/constants/api-code.js'

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
  actions?: readonly string[]
}

/**
 * 权限码的保守兜底规则。业务操作不能依赖这里确定最终风险，
 * 必须通过内置目录或数据库 OperationPolicy 显式登记。
 */
const PERMISSION_RISK_RULES: readonly RiskRule[] = [
  // Read-only account/role views and filtered assignment options do not mutate
  // authorization state. They still require the corresponding permission,
  // but must not force a step-up merely to render a page or selector.
  {
    level: 'L0',
    exact: [
      'system.user.read',
      'system.role.read',
      'system.role.options',
      'system.role.assignment-options',
      'system.approval.read',
      'system.approval.detail',
      'system.approval.target-options',
      'system.session.list',
      'system.ops-ticket.read',
      'system.ops-ticket.detail',
      'system.audit.read',
      'system.audit.detail',
      'system.audit.integrity',
      'system.page.read',
      'system.page.api.read',
      'system.button.read',
      'system.api.read',
      'system.api.options',
      'system.api.references',
      'system.field.read',
      'system.data-resource.read',
    ],
  },
  // Data-scope management is restricted to security administrators and uses
  // the global five-minute MFA/reauthentication step-up flow. It is not the
  // controlled-approval workflow used for high-risk role changes. Keep this
  // before the generic read-action fallback below.
  {
    level: 'L2',
    exact: ['system.data-scope.read', 'system.data-scope.update', 'system.data-scope.revoke'],
  },
  { level: 'L2', exact: ['system.page.enable', 'system.page.disable'] },
  // Binding or unbinding a page's read-only bootstrap APIs changes page
  // loading behavior, but does not grant an operation or alter the API route.
  { level: 'L2', exact: ['system.page.api.bind'] },
  {
    level: 'L0',
    exact: ['system.page.api.options'],
    actions: ['read', 'detail', 'options', 'list', 'status'],
  },
  // The field-security interceptor raises this baseline according to the
  // actual changed fields. A label/sort-only button update is therefore L1;
  // name/status/API changes still become L3 at the field boundary.
  { level: 'L1', exact: ['system.button.update'] },
  { level: 'L1', exact: ['system.directory.create'] },
  { level: 'L1', exact: ['system.directory.update'] },
  { level: 'L1', exact: ['system.directory.delete'] },
  { level: 'L2', exact: ['system.user.create', 'system.user.update'] },
  {
    level: 'L3',
    exact: [
      'system.approval.create',
      'system.approval.approve',
      'system.approval.execute',
      'system.approval.review',
      'system.approval.cancel',
      'system.ops-ticket.create',
      'system.ops-ticket.update',
      'system.ops-ticket.submit',
      'system.ops-ticket.approve',
      'system.ops-ticket.execute',
      'system.ops-ticket.review',
      'system.ops-ticket.cancel',
      'system.ops-ticket.evidence.create',
      'system.ops-ticket.execution.create',
      'system.role.create',
      'system.role.update',
      'system.role.enable',
      'system.role.disable',
      'system.role.grants.read',
      'system.role.grant',
      'system.role.delete',
      'system.role.revoke',
      'system.role.review',
      'system.permission.read',
      'system.permission.create',
      'system.permission.update',
      'system.permission.enable',
      'system.permission.disable',
      'system.permission.options',
      'system.permission.delete',
      'system.page.create',
      'system.page.update',
      'system.page.delete',
      'system.button.create',
      'system.button.status',
      'system.button.api.bind',
      'system.api.create',
      'system.api.update',
      'system.api.enable',
      'system.api.disable',
      'system.api.delete',
      'system.field.create',
      'system.field.update',
      'system.field.status',
      'system.data-resource.create',
      'system.data-resource.update',
      'system.data-resource.status',
      'system.operation-policy.create',
      'system.operation-policy.activate',
      'system.operation-policy.status',
    ],
  },
  {
    level: 'L3',
    exact: [
      'system.user.grant',
      'system.user.enable',
      'system.user.disable',
      'system.user.unlock',
      'system.user.reset-password',
      'system.user.mfa-reset',
    ],
  },
  {
    level: 'L2',
    exact: ['system.session.revoke', 'auth.password.change', 'auth.reauthenticate'],
  },
  {
    level: 'L2',
    exact: ['system.audit.export', 'system.audit.review', 'system.health.read'],
  },
]

function fallbackPermissionRisk(permission: string): RiskLevel {
  if (!permission) return 'L0'
  const action = permission.split('.').at(-1)
  for (const rule of PERMISSION_RISK_RULES) {
    if (rule.exact?.includes(permission)) return rule.level
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

export function securityStepUpException(actor: SecurityProofActor, level: RiskLevel, operationCode?: string) {
  return new ForbiddenException({
    code: API_CODE.SECURITY_STEP_UP_REQUIRED,
    message: '需要完成高风险操作验证',
    data: {
      riskLevel: level,
      operationCode: operationCode || null,
      requiredFactors: (actor as SecurityProofActor & { mfaEnabled?: boolean }).mfaEnabled
        ? ['PASSWORD', 'OTP']
        : ['PASSWORD'],
    },
  })
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
