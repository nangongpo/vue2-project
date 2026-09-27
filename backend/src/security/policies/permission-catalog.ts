import { RoleType } from '@prisma/client'
import { API_NAME_LABELS } from '../../common/constants/api-name-labels.js'

export type PermissionRolePolicy =
  | { type: 'SINGLE_ROLE'; roleType: RoleType }
  | { type: 'ROLE_ALLOWLIST'; roleTypes: readonly RoleType[] }

const OPS_TICKET_READ_POLICY: PermissionRolePolicy = {
  type: 'ROLE_ALLOWLIST',
  roleTypes: ['SECURITY', 'SYSTEM', 'AUDIT'],
}
const OPS_TICKET_OPERATE_POLICY: PermissionRolePolicy = {
  type: 'ROLE_ALLOWLIST',
  roleTypes: ['SECURITY', 'SYSTEM'],
}
const OPS_TICKET_REVIEW_POLICY: PermissionRolePolicy = {
  type: 'SINGLE_ROLE',
  roleType: 'AUDIT',
}
const APPROVAL_READ_POLICY: PermissionRolePolicy = {
  type: 'ROLE_ALLOWLIST',
  roleTypes: ['SECURITY', 'AUDIT'],
}

/** Page permissions do not go through ADMIN_APIS, so their policy is declared separately. */
export const PAGE_PERMISSION_ROLE_POLICIES: Readonly<Record<string, PermissionRolePolicy>> = {
  'page.system.ops-tickets': OPS_TICKET_READ_POLICY,
  'page.system.approval': APPROVAL_READ_POLICY,
}

// Non-route permissions used by approval workflows still need an explicit
// audience because they are persisted in the same permission table.
export const MANAGEMENT_PERMISSION_ROLE_POLICIES: Readonly<Record<string, PermissionRolePolicy>> = {
  'system.role.revoke': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.role.review': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.user.mfa-reset': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.audit.review': { type: 'SINGLE_ROLE', roleType: 'AUDIT' },
}

/** Resources owned by the server-side administration boundary. */
export const MANAGEMENT_RESOURCES = new Set([
  'system.user',
  'system.role',
  'system.permission',
  'system.permission.field',
  'system.page',
  'system.page.api',
  'system.button',
  'system.button.api',
  'system.api',
  'system.audit',
  'system.approval',
  'system.data-scope',
  'system.data-resource',
  'system.field',
  'system.ops-ticket',
  'system.operation-policy',
  'system.session',
  'system.config',
  'system.runtime',
])

/** Legacy resource names accepted by permission records created before resources were normalized. */
export const MANAGEMENT_RESOURCE_ALIASES = new Set([
  'user',
  'users',
  'role',
  'roles',
  'permission',
  'permissions',
  'audit',
  'audits',
])

/** Explicit API roots owned by the administration boundary. */
export const MANAGEMENT_API_ROOTS = new Set([
  '/api/v1/permission',
  '/api/v1/users',
  '/api/v1/roles',
  '/api/v1/audit',
  '/api/v1/audit-logs',
  '/api/v1/auth',
])

export function apiRoot(path: string) {
  const segments = path.split('/').filter(Boolean)
  return segments.length >= 3 ? `/${segments.slice(0, 3).join('/')}` : path
}

export function isManagementResource(resource: string) {
  return MANAGEMENT_RESOURCES.has(resource) || MANAGEMENT_RESOURCE_ALIASES.has(resource)
}

export function isManagementApiPath(path: string) {
  return MANAGEMENT_API_ROOTS.has(apiRoot(path))
}

export function isCatalogManagementCode(code: string) {
  return ADMIN_APIS.some((entry) => entry.code === code && isManagementResource(entry.resource))
}

// Data-field permissions are normally shared by the security and system
// administrators. Audit records are the exception: their fields belong to
// the audit administrator's read boundary and must not be silently omitted
// from an otherwise authorized audit response.
export const DATA_FIELD_ROLE_POLICIES: Readonly<Record<string, readonly RoleType[]>> = {
  'system.audit': ['AUDIT'],
  'system.approval': ['SECURITY', 'AUDIT'],
}

// Server-owned administrative catalog. Each API code denotes exactly one method/template.
export const ADMIN_APIS: Array<{
  code: string
  name: string
  method: string
  path: string
  resource: string
  action: string
  rolePolicy: PermissionRolePolicy
}> = []

type ApiOptions =
  | {
      roleType?: RoleType
      rolePolicy?: PermissionRolePolicy
      resource?: never
      action?: never
    }
  | {
      roleType?: RoleType
      rolePolicy?: PermissionRolePolicy
      resource: string
      action: string
    }

function api(code: string, method: string, path: string, options: ApiOptions = {}) {
  const roleType = options.roleType || 'SECURITY'
  const rolePolicy = options.rolePolicy || { type: 'SINGLE_ROLE' as const, roleType }
  const hasResource = options.resource !== undefined
  const hasAction = options.action !== undefined
  if (hasResource !== hasAction) throw new Error(`权限 ${code} 的 resource/action 必须成对声明`)
  if (hasResource && (!options.resource!.trim() || !options.action!.trim()))
    throw new Error(`权限 ${code} 的 resource/action 不能为空`)
  const [resource, action] = hasResource
    ? [options.resource!, options.action!]
    : [code.split('.').slice(0, -1).join('.'), code.split('.').at(-1)!]
  ADMIN_APIS.push({
    code,
    name: API_NAME_LABELS[code] || code,
    method,
    path: `/api/v1${path}`,
    resource,
    action,
    rolePolicy,
  })
}
for (const [domain, base] of [
  ['page', '/permission/functions'],
  ['button', '/permission/buttons'],
  ['api', '/permission/apis'],
] as const) {
  if (domain === 'button') api('system.button.read', 'GET', '/permission/functions/:functionId/buttons')
  else api(`system.${domain}.read`, 'GET', base)
  api(`system.${domain}.create`, 'POST', base)
  api(`system.${domain}.update`, 'PATCH', `${base}/:id`)
  if (domain === 'api') {
    api('system.api.enable', 'PATCH', `${base}/:id/enable`)
    api('system.api.disable', 'PATCH', `${base}/:id/disable`)
  } else if (domain === 'page') {
    api('system.page.enable', 'PATCH', `${base}/:id/enable`)
    api('system.page.disable', 'PATCH', `${base}/:id/disable`)
  } else api(`system.${domain}.status`, 'PATCH', `${base}/:id/status`)
  if (domain !== 'api') api(`system.${domain}.api.bind`, 'PATCH', `${base}/:id/apis`)
}
api('system.page.api.read', 'GET', '/permission/functions/:id/apis')
api('system.page.api.options', 'GET', '/permission/functions/api-options')
api('system.directory.create', 'POST', '/permission/directories')
api('system.directory.update', 'PATCH', '/permission/directories/:id')
api('system.directory.delete', 'DELETE', '/permission/directories/:id')
api('system.page.delete', 'DELETE', '/permission/functions/:id')
api('system.api.options', 'GET', '/permission/api-options')
api('system.api.references', 'GET', '/permission/apis/:id/references')
api('system.api.delete', 'DELETE', '/permission/apis/:id')
for (const domain of ['user', 'role'] as const) {
  const base = domain === 'user' ? '/users' : '/roles'
  api(`system.${domain}.read`, 'GET', base)
  api(`system.${domain}.create`, 'POST', base)
  api(`system.${domain}.update`, 'PATCH', `${base}/:id`)
  api(`system.${domain}.enable`, 'PATCH', `${base}/:id/enable`)
  api(`system.${domain}.disable`, 'PATCH', `${base}/:id/disable`)
}
api('system.user.reset-password', 'POST', '/users/:id/reset-password')
api('system.user.unlock', 'POST', '/users/:id/unlock')
api('system.user.grant', 'PATCH', '/users/:id/roles')
api('system.role.options', 'GET', '/roles/permission-options')
api('system.role.assignment-options', 'GET', '/roles/assignment-options')
api('system.role.grants.read', 'GET', '/roles/:id/grants', {
  roleType: 'SECURITY',
  resource: 'system.role',
  action: 'grants.read',
})
api('system.role.grant', 'PATCH', '/roles/:id/grants')
api('system.role.delete', 'DELETE', '/roles/:id')
api('system.audit.read', 'GET', '/audit-logs', { roleType: 'AUDIT' })
api('system.audit.detail', 'GET', '/audit-logs/:id', { roleType: 'AUDIT' })
api('system.audit.integrity', 'GET', '/audit-logs/:id/integrity', { roleType: 'AUDIT' })
api('system.audit.export', 'GET', '/audit-logs/export', { roleType: 'AUDIT' })
api('system.health.read', 'GET', '/system/health', { roleType: 'SYSTEM' })
api('system.approval.create', 'POST', '/permission/approvals')
api('system.approval.read', 'GET', '/permission/approvals', { roleType: 'BUSINESS', rolePolicy: APPROVAL_READ_POLICY })
api('system.approval.detail', 'GET', '/permission/approvals/:id', {
  roleType: 'BUSINESS',
  rolePolicy: APPROVAL_READ_POLICY,
})
api('system.approval.target-options', 'GET', '/permission/approvals/target-options')
api('system.approval.approve', 'POST', '/permission/approvals/:id/approve')
api('system.approval.execute', 'POST', '/permission/approvals/:id/execute')
api('system.approval.review', 'POST', '/permission/approvals/:id/review', { roleType: 'AUDIT' })
api('system.approval.cancel', 'POST', '/permission/approvals/:id/cancel')
api('system.data-scope.read', 'GET', '/permission/roles/:roleId/data-scopes')
api('system.data-scope.update', 'POST', '/permission/roles/:roleId/data-scopes')
api('system.data-scope.revoke', 'PATCH', '/permission/roles/:roleId/data-scopes/:scopeId/revoke')
api('system.field.read', 'GET', '/permission/fields')
api('system.field.create', 'POST', '/permission/fields')
api('system.field.update', 'PATCH', '/permission/fields/:id')
api('system.field.status', 'PATCH', '/permission/fields/:id/status')
api('system.data-resource.read', 'GET', '/permission/data-resources')
api('system.data-resource.create', 'POST', '/permission/data-resources')
api('system.data-resource.update', 'PATCH', '/permission/data-resources/:id')
api('system.data-resource.status', 'PATCH', '/permission/data-resources/:id/status')
for (const [action, method, path, roleType, rolePolicy] of [
  ['create', 'POST', '/ops-tickets', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['update', 'PATCH', '/ops-tickets/:id', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['submit', 'POST', '/ops-tickets/:id/submit', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['read', 'GET', '/ops-tickets', 'SECURITY', OPS_TICKET_READ_POLICY],
  ['detail', 'GET', '/ops-tickets/:id', 'SECURITY', OPS_TICKET_READ_POLICY],
  ['approve', 'POST', '/ops-tickets/:id/approve', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['execute', 'POST', '/ops-tickets/:id/execute', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
  ['review', 'POST', '/ops-tickets/:id/review', 'AUDIT', OPS_TICKET_REVIEW_POLICY],
  ['cancel', 'POST', '/ops-tickets/:id/cancel', 'SECURITY', OPS_TICKET_OPERATE_POLICY],
] as const) {
  api(`system.ops-ticket.${action}`, method, path, { roleType, rolePolicy })
}
api('system.ops-ticket.evidence.create', 'POST', '/ops-tickets/:id/evidence', {
  roleType: 'SECURITY',
  rolePolicy: OPS_TICKET_OPERATE_POLICY,
})
api('system.ops-ticket.execution.create', 'POST', '/ops-tickets/:id/executions', {
  roleType: 'SECURITY',
  rolePolicy: OPS_TICKET_OPERATE_POLICY,
})
api('system.operation-policy.read', 'GET', '/security/operation-policies', { roleType: 'SECURITY' })
api('system.operation-policy.create', 'POST', '/security/operation-policies', { roleType: 'SECURITY' })
api('system.operation-policy.activate', 'POST', '/security/operation-policies/:id/activate', { roleType: 'SECURITY' })
api('system.operation-policy.status', 'PATCH', '/security/operation-policies/:id/disable', { roleType: 'SECURITY' })
for (const [action, method, path] of [
  ['read', 'GET', '/orders'],
  ['create', 'POST', '/orders'],
  ['update', 'PATCH', '/orders/:id'],
  ['confirm', 'POST', '/orders/:id/confirm'],
  ['cancel', 'POST', '/orders/:id/cancel'],
] as const) {
  api(`order.${action}`, method, path, { roleType: 'BUSINESS' })
}

export function allowedRoleTypesForPermission(permission: {
  code: string
  type?: string
  rolePolicy?: PermissionRolePolicy
  roleTypes?: readonly { roleType: string }[]
}): readonly RoleType[] {
  const catalogCode = permission.code.startsWith('button.') ? permission.code.slice('button.'.length) : permission.code
  const catalogPolicy =
    permission.rolePolicy ||
    ADMIN_APIS.find((item) => item.code === catalogCode)?.rolePolicy ||
    MANAGEMENT_PERMISSION_ROLE_POLICIES[catalogCode]
  // A loaded relation is the runtime source of truth for every permission
  // type, including FIELD permissions. An empty relation is an explicit deny.
  if (permission.roleTypes !== undefined) return permission.roleTypes.map((item) => item.roleType as RoleType)

  // Data-field audience is declared by resource. Keep the default narrow and
  // explicit when the caller is resolving a catalog-only field definition.
  if (permission.type === 'FIELD') {
    const resource = permission.code.split('.field.')[0]
    return DATA_FIELD_ROLE_POLICIES[resource] || ['SECURITY', 'SYSTEM']
  }
  return catalogPolicy?.type === 'ROLE_ALLOWLIST'
    ? catalogPolicy.roleTypes
    : PAGE_PERMISSION_ROLE_POLICIES[catalogCode]?.type === 'ROLE_ALLOWLIST'
    ? PAGE_PERMISSION_ROLE_POLICIES[catalogCode].roleTypes
    : catalogPolicy
    ? [catalogPolicy.roleType]
    : []
}

export function roleAllowsPermission(
  roleType: string,
  permission: {
    code: string
    type?: string
    rolePolicy?: PermissionRolePolicy
    roleTypes?: readonly { roleType: string }[]
  }
) {
  return allowedRoleTypesForPermission(permission).includes(roleType as RoleType)
}
