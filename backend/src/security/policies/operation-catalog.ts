import type { RiskLevel } from '#app/security/policies/risk-policy.js'
import { API_BY_CODE } from '#app/security/policies/permission-catalog/index.js'

export type OperationDefinition = {
  operationCode: string
  name: string
  resource: string
  action: string
  riskLevel: RiskLevel
  requireMfa: boolean
  requireReauth: boolean
  requireApproval: boolean
  requireDualControl: boolean
  auditRequired: boolean
}

/**
 * Code-owned operations for non-business modules. Database policies may add
 * controls or raise the risk, but cannot lower these baselines.
 */
export const BUILT_IN_OPERATION_CATALOG: readonly OperationDefinition[] = [
  {
    operationCode: 'auth.password.change',
    name: '修改密码',
    resource: 'auth',
    action: 'password.change',
    riskLevel: 'L2',
    requireMfa: true,
    requireReauth: true,
    requireApproval: false,
    requireDualControl: false,
    auditRequired: true,
  },
  {
    operationCode: 'auth.mfa.reset',
    name: '重置多因素认证',
    resource: 'auth',
    action: 'mfa.reset',
    riskLevel: 'L3',
    requireMfa: true,
    requireReauth: true,
    requireApproval: true,
    requireDualControl: true,
    auditRequired: true,
  },
  {
    operationCode: 'system.session.revoke',
    name: '撤销登录会话',
    resource: 'system.session',
    action: 'revoke',
    riskLevel: 'L2',
    requireMfa: true,
    requireReauth: true,
    requireApproval: false,
    requireDualControl: false,
    auditRequired: true,
  },
  {
    operationCode: 'system.page.route-change',
    name: '修改页面路径',
    resource: 'system.page',
    action: 'route-change',
    riskLevel: 'L3',
    requireMfa: true,
    requireReauth: true,
    requireApproval: true,
    requireDualControl: false,
    auditRequired: true,
  },
]

const catalog = new Map(BUILT_IN_OPERATION_CATALOG.map((item) => [item.operationCode, item]))

// API-backed operations have one structured target in the permission catalog.
// Keep resource/action here for non-API security operations, but fail fast when
// a duplicated API target drifts from the permission directory.
for (const operation of BUILT_IN_OPERATION_CATALOG) {
  const permission = API_BY_CODE.get(operation.operationCode)
  if (!permission) continue
  if ((operation.resource && operation.resource !== permission.resource) || (operation.action && operation.action !== permission.action))
    throw new Error(`操作 ${operation.operationCode} 的 resource/action 与权限目录不一致`)
}

export function materializeOperation(operation: OperationDefinition): OperationDefinition & { resource: string; action: string } {
  const permission = API_BY_CODE.get(operation.operationCode)
  if (permission) return { ...operation, resource: permission.resource, action: permission.action }
  return operation
}

export function getBuiltInOperation(operationCode: string) {
  return catalog.get(operationCode)
}
