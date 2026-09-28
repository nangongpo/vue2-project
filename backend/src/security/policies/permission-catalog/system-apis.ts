import { apiNameLabel } from '#app/common/constants/api-name-labels.js'
import {
  APPROVAL_READ_POLICY,
  OPS_TICKET_OPERATE_POLICY,
  OPS_TICKET_READ_POLICY,
  OPS_TICKET_REVIEW_POLICY,
} from '#app/security/policies/permission-catalog/role-policies.js'
import type { ApiDefinition, HttpMethod, PermissionRolePolicy, RiskBaseline } from '#app/security/policies/permission-catalog/types.js'

type SystemApiOptions = {
  roleType?: 'SECURITY' | 'SYSTEM' | 'AUDIT' | 'BUSINESS'
  rolePolicy?: PermissionRolePolicy
  resource: string
  action: string
  riskBaseline?: RiskBaseline
}

function baseline(riskLevel: RiskBaseline['riskLevel'], overrides: Partial<RiskBaseline> = {}): RiskBaseline {
  return {
    riskLevel,
    requireMfa: riskLevel === 'L2' || riskLevel === 'L3',
    requireReauth: riskLevel === 'L2' || riskLevel === 'L3',
    requireApproval: riskLevel === 'L3',
    requireDualControl: false,
    auditRequired: true,
    ...overrides,
  }
}

function api(code: string, method: HttpMethod, path: `/${string}`, options: SystemApiOptions): ApiDefinition {
  if (!options.resource.trim() || !options.action.trim()) throw new Error(`权限 ${code} 的 resource/action 不能为空`)
  const roleType = options.roleType || 'SECURITY'
  return {
    code,
    name: apiNameLabel(code),
    method,
    path: `/api/v1${path}`,
    resource: options.resource,
    action: options.action,
    rolePolicy: options.rolePolicy || { type: 'SINGLE_ROLE', roleType },
    riskBaseline: options.riskBaseline || baseline('L1'),
  }
}

const definitions: ApiDefinition[] = []
for (const [domain, base] of [
  ['page', '/permission/pages'], ['button', '/permission/buttons'], ['api', '/permission/apis'],
] as const) {
  const resource = `system.${domain}`
  const readPath: `/${string}` = domain === 'page' ? `${base}/tree` : base
  definitions.push(domain === 'button'
    ? api('system.button.read', 'GET', '/permission/pages/:pageId/buttons', { resource, action: 'read' })
    : api(`system.${domain}.read`, 'GET', readPath, { resource, action: 'read' }))
  definitions.push(api(`system.${domain}.create`, 'POST', base, { resource, action: 'create' }))
  definitions.push(api(`system.${domain}.update`, 'PATCH', `${base}/:id`, { resource, action: 'update' }))
  if (domain === 'api') {
    definitions.push(api('system.api.enable', 'PATCH', `${base}/:id/enable`, { resource, action: 'enable' }))
    definitions.push(api('system.api.disable', 'PATCH', `${base}/:id/disable`, { resource, action: 'disable' }))
  } else if (domain === 'page') {
    definitions.push(api('system.page.enable', 'PATCH', `${base}/:id/enable`, { resource, action: 'enable' }))
    definitions.push(api('system.page.disable', 'PATCH', `${base}/:id/disable`, { resource, action: 'disable' }))
  } else {
    definitions.push(api('system.button.enable', 'PATCH', `${base}/:id/enable`, { resource, action: 'enable' }))
    definitions.push(api('system.button.disable', 'PATCH', `${base}/:id/disable`, { resource, action: 'disable' }))
  }
  if (domain !== 'api') {
    const bindingPath: `/${string}` = domain === 'page' ? `${base}/:id/base-apis` : `${base}/:id/apis`
    definitions.push(api(`system.${domain}.api.bind`, 'PATCH', bindingPath, { resource: `system.${domain}.api`, action: 'bind' }))
  }
}
const add = (code: string, method: HttpMethod, path: `/${string}`, options: SystemApiOptions) => definitions.push(api(code, method, path, options))

add('system.page.api.read', 'GET', '/permission/pages/:pageId/base-apis', { resource: 'system.page.api', action: 'read' })
add('system.page.api.options', 'GET', '/permission/pages/base-apis/options', { resource: 'system.page.api', action: 'options' })
add('system.directory.create', 'POST', '/permission/directories', { resource: 'system.directory', action: 'create' })
add('system.directory.update', 'PATCH', '/permission/directories/:id', { resource: 'system.directory', action: 'update' })
add('system.directory.delete', 'DELETE', '/permission/directories/:id', { resource: 'system.directory', action: 'delete' })
add('system.page.delete', 'DELETE', '/permission/pages/:id', { resource: 'system.page', action: 'delete' })
add('system.api.options', 'GET', '/permission/api-options', { resource: 'system.api', action: 'options' })
add('system.button.options', 'GET', '/permission/buttons/action-options', { resource: 'system.button', action: 'options' })
add('system.api.references', 'GET', '/permission/apis/:id/references', { resource: 'system.api', action: 'references' })
add('system.api.delete', 'DELETE', '/permission/apis/:id', { resource: 'system.api', action: 'delete' })

for (const domain of ['user', 'role'] as const) {
  const base = domain === 'user' ? '/users' : '/roles'
  const resource = `system.${domain}`
  for (const [action, method, path] of [['read', 'GET', base], ['create', 'POST', base], ['update', 'PATCH', `${base}/:id`], ['enable', 'PATCH', `${base}/:id/enable`], ['disable', 'PATCH', `${base}/:id/disable`]] as const)
    add(`system.${domain}.${action}`, method, path, { resource, action })
}
add('system.user.reset-password', 'POST', '/users/:id/reset-password', { resource: 'system.user', action: 'reset-password' })
add('system.user.unlock', 'POST', '/users/:id/unlock', { resource: 'system.user', action: 'unlock' })
add('system.user.grant', 'PATCH', '/users/:id/roles', { resource: 'system.user', action: 'grant' })
add('system.role.options', 'GET', '/roles/permission-options', { resource: 'system.role', action: 'options' })
add('system.role.assignment-options', 'GET', '/roles/assignment-options', { resource: 'system.role', action: 'assignment-options' })
add('system.role.grants.read', 'GET', '/roles/:id/grants', { roleType: 'SECURITY', resource: 'system.role', action: 'grants.read' })
add('system.role.grant', 'PATCH', '/roles/:id/grants', { resource: 'system.role', action: 'grant' })
add('system.role.delete', 'DELETE', '/roles/:id', { resource: 'system.role', action: 'delete' })
for (const [action, method, path] of [['read', 'GET', '/audit-logs'], ['detail', 'GET', '/audit-logs/:id'], ['integrity', 'GET', '/audit-logs/:id/integrity'], ['export', 'GET', '/audit-logs/export']] as const)
  add(`system.audit.${action}`, method, path, { roleType: 'AUDIT', resource: 'system.audit', action })
add('system.health.read', 'GET', '/system/health', { roleType: 'SYSTEM', resource: 'system.health', action: 'read' })
add('system.approval.create', 'POST', '/permission/approvals', { resource: 'system.approval', action: 'create' })
add('system.approval.read', 'GET', '/permission/approvals', { roleType: 'BUSINESS', rolePolicy: APPROVAL_READ_POLICY, resource: 'system.approval', action: 'read' })
add('system.approval.detail', 'GET', '/permission/approvals/:id', { roleType: 'BUSINESS', rolePolicy: APPROVAL_READ_POLICY, resource: 'system.approval', action: 'detail' })
for (const [action, method, path] of [['target-options', 'GET', '/permission/approvals/target-options'], ['approve', 'POST', '/permission/approvals/:id/approve'], ['execute', 'POST', '/permission/approvals/:id/execute'], ['cancel', 'POST', '/permission/approvals/:id/cancel']] as const)
  add(`system.approval.${action}`, method, path, { resource: 'system.approval', action })
add('system.approval.review', 'POST', '/permission/approvals/:id/review', { roleType: 'AUDIT', resource: 'system.approval', action: 'review' })
for (const [action, method, path, roleType, rolePolicy] of [
  ['create', 'POST', '/ops-tickets', 'SECURITY', OPS_TICKET_OPERATE_POLICY], ['update', 'PATCH', '/ops-tickets/:id', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['submit', 'POST', '/ops-tickets/:id/submit', 'SECURITY', OPS_TICKET_OPERATE_POLICY], ['read', 'GET', '/ops-tickets', 'SECURITY', OPS_TICKET_READ_POLICY],
  ['detail', 'GET', '/ops-tickets/:id', 'SECURITY', OPS_TICKET_READ_POLICY], ['approve', 'POST', '/ops-tickets/:id/approve', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['execute', 'POST', '/ops-tickets/:id/execute', 'SECURITY', OPS_TICKET_OPERATE_POLICY], ['review', 'POST', '/ops-tickets/:id/review', 'AUDIT', OPS_TICKET_REVIEW_POLICY],
  ['cancel', 'POST', '/ops-tickets/:id/cancel', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
] as const) add(`system.ops-ticket.${action}`, method, path, { roleType, rolePolicy, resource: 'system.ops-ticket', action })
add('system.ops-ticket.evidence.create', 'POST', '/ops-tickets/:id/evidence', { roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY, resource: 'system.ops-ticket.evidence', action: 'create' })
add('system.ops-ticket.execution.create', 'POST', '/ops-tickets/:id/executions', { roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY, resource: 'system.ops-ticket.execution', action: 'create' })
add('system.operation-policy.read', 'GET', '/security/operation-policies', {
  roleType: 'SECURITY',
  resource: 'system.operation-policy',
  action: 'read',
})
for (const [action, method, path] of [['read', 'GET', '/permission/fields'], ['create', 'POST', '/permission/fields'], ['update', 'PATCH', '/permission/fields/:id'], ['enable', 'PATCH', '/permission/fields/:id/enable'], ['disable', 'PATCH', '/permission/fields/:id/disable']] as const)
  add(`system.field.${action}`, method, path, { resource: 'system.field', action })
for (const [action, method, path] of [['read', 'GET', '/permission/data-resources'], ['create', 'POST', '/permission/data-resources'], ['update', 'PATCH', '/permission/data-resources/:id'], ['enable', 'PATCH', '/permission/data-resources/:id/enable'], ['disable', 'PATCH', '/permission/data-resources/:id/disable']] as const)
  add(`system.data-resource.${action}`, method, path, { resource: 'system.data-resource', action })
for (const [action, method, path] of [['read', 'GET', '/permission/roles/:roleId/data-scopes'], ['update', 'POST', '/permission/roles/:roleId/data-scopes'], ['revoke', 'PATCH', '/permission/roles/:roleId/data-scopes/:scopeId/revoke']] as const)
  add(`system.data-scope.${action}`, method, path, { resource: 'system.data-scope', action })

const SYSTEM_RISK_LEVELS: Record<string, RiskBaseline['riskLevel']> = Object.fromEntries([
  ...[
    'system.user.read', 'system.role.read', 'system.role.options', 'system.role.assignment-options',
    'system.approval.read', 'system.approval.detail', 'system.approval.target-options',
    'system.ops-ticket.read', 'system.ops-ticket.detail', 'system.audit.read', 'system.audit.detail',
    'system.audit.integrity', 'system.page.read', 'system.page.api.read', 'system.button.read',
    'system.api.read', 'system.api.options', 'system.api.references', 'system.field.read',
    'system.data-resource.read', 'system.page.api.options', 'system.button.options',
  ].map((code) => [code, 'L0']),
  ...['system.button.update', 'system.directory.create', 'system.directory.update', 'system.directory.delete', 'system.operation-policy.read'].map((code) => [code, 'L1']),
  ...[
    'system.data-scope.read', 'system.data-scope.update', 'system.data-scope.revoke', 'system.page.enable',
    'system.page.disable', 'system.page.api.bind', 'system.page.update', 'system.user.create', 'system.user.update',
    'system.audit.export', 'system.health.read',
  ].map((code) => [code, 'L2']),
  ...[
    'system.approval.create', 'system.approval.approve', 'system.approval.execute', 'system.approval.review',
    'system.approval.cancel', 'system.ops-ticket.create', 'system.ops-ticket.update', 'system.ops-ticket.submit',
    'system.ops-ticket.approve', 'system.ops-ticket.execute', 'system.ops-ticket.review', 'system.ops-ticket.cancel',
    'system.ops-ticket.evidence.create', 'system.ops-ticket.execution.create', 'system.role.create',
    'system.role.update', 'system.role.enable', 'system.role.disable', 'system.role.grants.read',
    'system.role.grant', 'system.role.delete', 'system.page.create', 'system.page.delete',
    'system.button.create', 'system.button.enable', 'system.button.disable', 'system.button.api.bind',
    'system.api.create', 'system.api.update', 'system.api.enable', 'system.api.disable', 'system.api.delete',
    'system.field.create', 'system.field.update', 'system.field.enable', 'system.field.disable',
    'system.data-resource.create', 'system.data-resource.update', 'system.data-resource.enable',
    'system.data-resource.disable', 'system.user.grant', 'system.user.enable', 'system.user.disable',
    'system.user.unlock', 'system.user.reset-password', 'system.user.mfa-reset',
  ].map((code) => [code, 'L3']),
])
for (const definition of definitions) {
  const riskLevel = SYSTEM_RISK_LEVELS[definition.code]
  if (!riskLevel) throw new Error(`系统 API ${definition.code} 未声明风险基线`)
  definition.riskBaseline = {
    riskLevel,
    requireMfa: riskLevel === 'L2' || riskLevel === 'L3',
    requireReauth: riskLevel === 'L2' || riskLevel === 'L3',
    requireApproval: riskLevel === 'L3',
    requireDualControl: definition.code === 'system.role.grant',
    auditRequired: true,
  }
}

export const SYSTEM_APIS = Object.freeze(definitions)
export const SYSTEM_API_CODES = new Set(SYSTEM_APIS.map((entry) => entry.code))
