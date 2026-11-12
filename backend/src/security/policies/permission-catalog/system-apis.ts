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
const registeredCodes = new Set<string>()

// 统一注册入口：权限码必须唯一，重复配置直接失败，禁止静默覆盖或去重。
const register = (definition: ApiDefinition) => {
  if (registeredCodes.has(definition.code)) throw new Error(`重复的系统接口权限码：${definition.code}`)
  registeredCodes.add(definition.code)
  definitions.push(definition)
}

const add = (code: string, method: HttpMethod, path: `/${string}`, options: SystemApiOptions) => register(api(code, method, path, options))

// 页面、按钮和接口目录：完整声明每个功能域的 CRUD、启停用及关联配置。
for (const definition of [
  { code: 'system.page.read', method: 'GET', path: '/permission/pages/tree', resource: 'system.page', action: 'read' },
  { code: 'system.page.create', method: 'POST', path: '/permission/pages', resource: 'system.page', action: 'create' },
  { code: 'system.page.update', method: 'PATCH', path: '/permission/pages/:id', resource: 'system.page', action: 'update' },
  { code: 'system.page.enable', method: 'PATCH', path: '/permission/pages/:id/enable', resource: 'system.page', action: 'enable' },
  { code: 'system.page.disable', method: 'PATCH', path: '/permission/pages/:id/disable', resource: 'system.page', action: 'disable' },
  { code: 'system.page.api.bind', method: 'PATCH', path: '/permission/pages/:id/base-apis', resource: 'system.page.api', action: 'bind' },
  { code: 'system.button.read', method: 'GET', path: '/permission/pages/:pageId/buttons', resource: 'system.button', action: 'read' },
  { code: 'system.button.create', method: 'POST', path: '/permission/buttons', resource: 'system.button', action: 'create' },
  { code: 'system.button.update', method: 'PATCH', path: '/permission/buttons/:id', resource: 'system.button', action: 'update' },
  { code: 'system.button.enable', method: 'PATCH', path: '/permission/buttons/:id/enable', resource: 'system.button', action: 'enable' },
  { code: 'system.button.disable', method: 'PATCH', path: '/permission/buttons/:id/disable', resource: 'system.button', action: 'disable' },
  { code: 'system.button.api.bind', method: 'PATCH', path: '/permission/buttons/:id/apis', resource: 'system.button.api', action: 'bind' },
  { code: 'system.api.read', method: 'GET', path: '/permission/apis', resource: 'system.api', action: 'read' },
  { code: 'system.api.create', method: 'POST', path: '/permission/apis', resource: 'system.api', action: 'create' },
  { code: 'system.api.update', method: 'PATCH', path: '/permission/apis/:id', resource: 'system.api', action: 'update' },
  { code: 'system.api.enable', method: 'PATCH', path: '/permission/apis/:id/enable', resource: 'system.api', action: 'enable' },
  { code: 'system.api.disable', method: 'PATCH', path: '/permission/apis/:id/disable', resource: 'system.api', action: 'disable' },
] as const) {
  add(definition.code, definition.method, definition.path, {
    resource: definition.resource,
    action: definition.action,
  })
}

// 页面与接口关联、目录管理以及权限配置项查询。
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

// 用户与角色管理：基础生命周期操作，以及密码、解锁和角色授权操作。
for (const domain of ['user', 'role'] as const) {
  const base = domain === 'user' ? '/users' : '/roles'
  const resource = `system.${domain}`
  for (const { action, method, path } of [
    { action: 'read', method: 'GET', path: base },
    { action: 'create', method: 'POST', path: base },
    { action: 'update', method: 'PATCH', path: `${base}/:id` },
    { action: 'enable', method: 'PATCH', path: `${base}/:id/enable` },
    { action: 'disable', method: 'PATCH', path: `${base}/:id/disable` },
  ] as const) {
    add(`system.${domain}.${action}`, method, path, { resource, action })
  }
}

add('system.user.reset-password', 'POST', '/users/:id/reset-password', { resource: 'system.user', action: 'reset-password' })
add('system.user.unlock', 'POST', '/users/:id/unlock', { resource: 'system.user', action: 'unlock' })
add('system.user.grant', 'PATCH', '/users/:id/roles', { resource: 'system.user', action: 'grant' })
add('system.role.options', 'GET', '/roles/permission-options', { resource: 'system.role', action: 'options' })
add('system.role.assignment-options', 'GET', '/roles/assignment-options', { resource: 'system.role', action: 'assignment-options' })

// 组织与部门管理：仅安全管理员和系统管理员可操作。
for (const { code, method, path, resource, action } of [
  { code: 'system.organization.read', method: 'GET', path: '/organizations', resource: 'system.organization', action: 'read' },
  { code: 'system.organization.create', method: 'POST', path: '/organizations', resource: 'system.organization', action: 'create' },
  { code: 'system.organization.update', method: 'PATCH', path: '/organizations/:id', resource: 'system.organization', action: 'update' },
  { code: 'system.organization.status', method: 'PATCH', path: '/organizations/:id/status', resource: 'system.organization', action: 'status' },
  { code: 'system.department.read', method: 'GET', path: '/departments', resource: 'system.department', action: 'read' },
  { code: 'system.department.create', method: 'POST', path: '/departments', resource: 'system.department', action: 'create' },
  { code: 'system.department.update', method: 'PATCH', path: '/departments/:id', resource: 'system.department', action: 'update' },
  { code: 'system.department.status', method: 'PATCH', path: '/departments/:id/status', resource: 'system.department', action: 'status' },
] as const) {
  add(code, method, path, {
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
    resource,
    action,
  })
}

add('system.role.grants.read', 'GET', '/roles/:id/grants', { roleType: 'SECURITY', resource: 'system.role', action: 'grants.read' })
add('system.role.grant', 'PATCH', '/roles/:id/grants', { resource: 'system.role', action: 'grant' })
add('system.role.delete', 'DELETE', '/roles/:id', { resource: 'system.role', action: 'delete' })

// 审计日志：只授予审计管理员，完整性校验和导出单独建权。
for (const { action, method, path } of [
  { action: 'read', method: 'GET', path: '/audit-logs' },
  { action: 'detail', method: 'GET', path: '/audit-logs/:id' },
  { action: 'integrity', method: 'GET', path: '/audit-logs/:id/integrity' },
  { action: 'export', method: 'GET', path: '/audit-logs/export' },
] as const) {
  add(`system.audit.${action}`, method, path, { roleType: 'AUDIT', resource: 'system.audit', action })
}

add('system.health.read', 'GET', '/system/health', { roleType: 'SYSTEM', resource: 'system.health', action: 'read' })

// 审批流程：申请、查询、审批、执行、撤销和审计复核分离授权。
add('system.approval.create', 'POST', '/permission/approvals', { resource: 'system.approval', action: 'create' })
add('system.approval.read', 'GET', '/permission/approvals', { roleType: 'BUSINESS', rolePolicy: APPROVAL_READ_POLICY, resource: 'system.approval', action: 'read' })
add('system.approval.detail', 'GET', '/permission/approvals/:id', { roleType: 'BUSINESS', rolePolicy: APPROVAL_READ_POLICY, resource: 'system.approval', action: 'detail' })
for (const { action, method, path } of [
  { action: 'target-options', method: 'GET', path: '/permission/approvals/target-options' },
  { action: 'approve', method: 'POST', path: '/permission/approvals/:id/approve' },
  { action: 'execute', method: 'POST', path: '/permission/approvals/:id/execute' },
  { action: 'cancel', method: 'POST', path: '/permission/approvals/:id/cancel' },
] as const) {
  add(`system.approval.${action}`, method, path, { resource: 'system.approval', action })
}

add('system.approval.review', 'POST', '/permission/approvals/:id/review', { roleType: 'AUDIT', resource: 'system.approval', action: 'review' })

// 运维应急工单：操作、读取和审计复核使用不同的角色策略。
for (const { action, method, path, roleType, rolePolicy } of [
  { action: 'create', method: 'POST', path: '/ops-tickets', roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY },
  { action: 'update', method: 'PATCH', path: '/ops-tickets/:id', roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY },
  { action: 'submit', method: 'POST', path: '/ops-tickets/:id/submit', roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY },
  { action: 'read', method: 'GET', path: '/ops-tickets', roleType: 'SECURITY', rolePolicy: OPS_TICKET_READ_POLICY },
  { action: 'detail', method: 'GET', path: '/ops-tickets/:id', roleType: 'SECURITY', rolePolicy: OPS_TICKET_READ_POLICY },
  { action: 'options', method: 'GET', path: '/ops-tickets/options', roleType: 'SECURITY', rolePolicy: OPS_TICKET_READ_POLICY },
  { action: 'approve', method: 'POST', path: '/ops-tickets/:id/approve', roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY },
  { action: 'execute', method: 'POST', path: '/ops-tickets/:id/execute', roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY },
  { action: 'review', method: 'POST', path: '/ops-tickets/:id/review', roleType: 'AUDIT', rolePolicy: OPS_TICKET_REVIEW_POLICY },
  { action: 'cancel', method: 'POST', path: '/ops-tickets/:id/cancel', roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY },
] as const) {
  add(`system.ops-ticket.${action}`, method, path, { roleType, rolePolicy, resource: 'system.ops-ticket', action })
}

add('system.ops-ticket.evidence.create', 'POST', '/ops-tickets/:id/evidence', { roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY, resource: 'system.ops-ticket.evidence', action: 'create' })
add('system.ops-ticket.execution.create', 'POST', '/ops-tickets/:id/executions', { roleType: 'SECURITY', rolePolicy: OPS_TICKET_OPERATE_POLICY, resource: 'system.ops-ticket.execution', action: 'create' })
add('system.operation-policy.read', 'GET', '/security/operation-policies', {
  roleType: 'SECURITY',
  resource: 'system.operation-policy',
  action: 'read',
})

// 字段权限、数据资源和角色数据范围管理。
for (const { action, method, path } of [
  { action: 'read', method: 'GET', path: '/permission/fields' },
  { action: 'create', method: 'POST', path: '/permission/fields' },
  { action: 'update', method: 'PATCH', path: '/permission/fields/:id' },
  { action: 'enable', method: 'PATCH', path: '/permission/fields/:id/enable' },
  { action: 'disable', method: 'PATCH', path: '/permission/fields/:id/disable' },
] as const) {
  add(`system.field.${action}`, method, path, { resource: 'system.field', action })
}

for (const { action, method, path } of [
  { action: 'read', method: 'GET', path: '/permission/data-resources' },
  { action: 'create', method: 'POST', path: '/permission/data-resources' },
  { action: 'update', method: 'PATCH', path: '/permission/data-resources/:id' },
  { action: 'enable', method: 'PATCH', path: '/permission/data-resources/:id/enable' },
  { action: 'disable', method: 'PATCH', path: '/permission/data-resources/:id/disable' },
] as const) {
  add(`system.data-resource.${action}`, method, path, { resource: 'system.data-resource', action })
}

for (const { action, method, path } of [
  { action: 'read', method: 'GET', path: '/permission/roles/:roleId/data-scopes' },
  { action: 'update', method: 'POST', path: '/permission/roles/:roleId/data-scopes' },
  { action: 'revoke', method: 'PATCH', path: '/permission/roles/:roleId/data-scopes/:scopeId/revoke' },
] as const) {
  add(`system.data-scope.${action}`, method, path, { resource: 'system.data-scope', action })
}

// 文件管理与文件审计：文件审计权限和文件运维权限使用独立资源及角色策略。
for (const definition of [
  {
    code: 'system.file.audit.read',
    method: 'GET',
    path: '/files/audit',
    resource: 'system.file.audit',
    action: 'audit.read',
    rolePolicy: { type: 'SINGLE_ROLE', roleType: 'AUDIT' },
  },
  {
    code: 'system.file.admin.read',
    method: 'GET',
    path: '/files',
    resource: 'system.file',
    action: 'admin.read',
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
  },
  {
    code: 'system.file.admin.detail',
    method: 'GET',
    path: '/files/:fileId',
    resource: 'system.file',
    action: 'admin.detail',
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
  },
  {
    code: 'system.file.admin.scan',
    method: 'POST',
    path: '/files/:fileId/rescan',
    resource: 'system.file',
    action: 'admin.scan',
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
  },
  {
    code: 'system.file.admin.reject',
    method: 'POST',
    path: '/files/:fileId/reject',
    resource: 'system.file',
    action: 'admin.reject',
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
  },
  {
    code: 'system.file.admin.delete',
    method: 'POST',
    path: '/files/:fileId/delete',
    resource: 'system.file',
    action: 'admin.delete',
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
  },
  {
    code: 'system.file.admin.restore',
    method: 'POST',
    path: '/files/:fileId/restore',
    resource: 'system.file',
    action: 'admin.restore',
    rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
  },
] as const) {
  add(definition.code, definition.method, definition.path, definition)
}

for (const [action, path] of [
  ['read', '/files/:fileId/scan-jobs'],
  ['detail', '/files/:fileId/scan-jobs/:jobId'],
  ['attempts', '/files/:fileId/scan-jobs/:jobId/attempts'],
] as const) add(`system.file.admin.scan-history.${action}`, 'GET', path, {
  resource: 'system.file', action: `admin.scan-history.${action}`,
  rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
})

// 风险基线集中声明，避免在各接口配置中重复维护安全要求。
const SYSTEM_RISK_LEVELS: Record<string, RiskBaseline['riskLevel']> = Object.fromEntries([
  // L0：只读和选项查询，不改变系统状态。
  ...[
    'system.user.read', 'system.role.read', 'system.role.options', 'system.role.assignment-options',
    'system.approval.read', 'system.approval.detail', 'system.approval.target-options',
    'system.ops-ticket.read', 'system.ops-ticket.options', 'system.ops-ticket.detail', 'system.audit.read', 'system.audit.detail',
    'system.audit.integrity', 'system.page.read', 'system.page.api.read', 'system.button.read',
    'system.api.read', 'system.api.options', 'system.api.references', 'system.field.read',
    'system.data-resource.read', 'system.page.api.options', 'system.button.options',
    'system.organization.read',
    'system.department.read',
  ].map((code) => [code, 'L0']),
  // L1：低风险的配置读取和单项详情。
  ...['system.button.update', 'system.directory.create', 'system.directory.update', 'system.directory.delete', 'system.operation-policy.read',
    'system.file.admin.read', 'system.file.admin.detail', 'system.file.admin.scan-history.read',
    'system.file.admin.scan-history.detail', 'system.file.admin.scan-history.attempts'].map((code) => [code, 'L1']),
  // L2：需要 MFA 和重新认证，但不要求审批。
  ...[
    'system.data-scope.read', 'system.data-scope.update', 'system.data-scope.revoke', 'system.page.enable',
    'system.page.disable', 'system.page.api.bind', 'system.page.update', 'system.user.create', 'system.user.update',
    'system.audit.export', 'system.health.read',
    'system.file.admin.scan',
    'system.file.admin.reject', 'system.file.admin.delete', 'system.file.admin.restore', 'system.file.audit.read',
  ].map((code) => [code, 'L2']),
  // L3：高风险变更，要求审批并按策略执行双人控制。
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
    'system.organization.create', 'system.organization.update', 'system.organization.status',
    'system.department.create', 'system.department.update', 'system.department.status',
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
