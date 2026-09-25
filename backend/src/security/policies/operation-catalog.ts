import type { RiskLevel } from './risk-policy.js'

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
  {
    operationCode: 'system.api.delete',
    name: '删除接口权限',
    resource: 'system.api',
    action: 'delete',
    riskLevel: 'L3',
    requireMfa: true,
    requireReauth: true,
    requireApproval: true,
    requireDualControl: false,
    auditRequired: true,
  },
  {
    operationCode: 'system.role.grant',
    name: '授予角色权限',
    resource: 'system.role',
    action: 'grant',
    riskLevel: 'L3',
    requireMfa: true,
    requireReauth: true,
    requireApproval: true,
    requireDualControl: true,
    auditRequired: true,
  },
]

const catalog = new Map(BUILT_IN_OPERATION_CATALOG.map((item) => [item.operationCode, item]))

export function getBuiltInOperation(operationCode: string) {
  return catalog.get(operationCode)
}
