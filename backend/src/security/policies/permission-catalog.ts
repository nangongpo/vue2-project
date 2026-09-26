import { RoleType } from '@prisma/client'
// Server-owned administrative catalog. Each API code denotes exactly one method/template.
export const ADMIN_APIS: Array<{
  code: string
  name: string
  method: string
  path: string
  resource: string
  action: string
  requiredRoleType: RoleType
}> = []
function api(code: string, method: string, path: string, roleType: RoleType = 'SECURITY') {
  const [resource, action] = [code.split('.').slice(0, -1).join('.'), code.split('.').at(-1)!]
  ADMIN_APIS.push({
    code,
    name: code,
    method,
    path: `/api/v1${path}`,
    resource,
    action,
    requiredRoleType: roleType,
  })
}
for (const [domain, base] of [
  ['page', '/permission/functions'],
  ['button', '/permission/buttons'],
  ['api', '/permission/apis'],
] as const) {
  if (domain === 'button')
    api('system.button.read', 'GET', '/permission/functions/:functionId/buttons')
  else api(`system.${domain}.read`, 'GET', base)
  api(`system.${domain}.create`, 'POST', base)
  api(`system.${domain}.update`, 'PATCH', `${base}/:id`)
  api(`system.${domain}.disable`, 'PATCH', `${base}/:id/status`)
  if (domain !== 'api') api(`system.${domain}.bind-api`, 'PATCH', `${base}/:id/apis`)
}
api('system.page.apis', 'GET', '/permission/functions/:id/apis')
api('system.api.options', 'GET', '/permission/api-options')
api('system.api.references', 'GET', '/permission/apis/:id/references')
api('system.api.delete', 'DELETE', '/permission/apis/:id')
for (const domain of ['user', 'role'] as const) {
  const base = domain === 'user' ? '/users' : '/roles'
  api(`system.${domain}.read`, 'GET', base)
  api(`system.${domain}.create`, 'POST', base)
  api(`system.${domain}.update`, 'PATCH', `${base}/:id`)
  api(`system.${domain}.disable`, 'PATCH', `${base}/:id/status`)
}
api('system.user.reset-password', 'POST', '/users/:id/reset-password')
api('system.user.unlock', 'POST', '/users/:id/unlock')
api('system.user.grant', 'PATCH', '/users/:id/roles')
api('system.role.options', 'GET', '/roles/permission-options')
api('system.role.grant', 'PATCH', '/roles/:id/grants')
api('system.role.delete', 'DELETE', '/roles/:id')
api('system.audit.read', 'GET', '/audit-logs', 'AUDIT')
api('system.audit.detail', 'GET', '/audit-logs/:id', 'AUDIT')
api('system.audit.integrity', 'GET', '/audit-logs/:id/integrity', 'AUDIT')
api('system.audit.export', 'GET', '/audit-logs/export', 'AUDIT')
api('system.health.read', 'GET', '/system/health', 'SYSTEM')
api('system.approval.create', 'POST', '/permission/approvals')
api('system.approval.read', 'GET', '/permission/approvals', 'BUSINESS')
api('system.approval.detail', 'GET', '/permission/approvals/:id', 'BUSINESS')
api('system.approval.approve', 'POST', '/permission/approvals/:id/approve')
api('system.approval.execute', 'POST', '/permission/approvals/:id/execute')
api('system.approval.review', 'POST', '/permission/approvals/:id/review', 'AUDIT')
api('system.data.read', 'GET', '/permission/roles/:roleId/data-scopes')
api('system.data.update', 'POST', '/permission/roles/:roleId/data-scopes')
api('system.data.revoke', 'PATCH', '/permission/roles/:roleId/data-scopes/:scopeId/revoke')
api('system.permission.field.read', 'GET', '/permission/fields')
api('system.permission.field.update', 'PATCH', '/permission/fields/:id')
api('system.permission.field.disable', 'PATCH', '/permission/fields/:id/status')
for (const [action, method, path, roleType] of [
  ['create', 'POST', '/ops-tickets', 'SECURITY'],
  ['update', 'PATCH', '/ops-tickets/:id', 'SECURITY'],
  ['submit', 'POST', '/ops-tickets/:id/submit', 'SECURITY'],
  ['read', 'GET', '/ops-tickets', 'SECURITY'],
  ['detail', 'GET', '/ops-tickets/:id', 'SECURITY'],
  ['approve', 'POST', '/ops-tickets/:id/approve', 'SECURITY'],
  ['execute', 'POST', '/ops-tickets/:id/execute', 'SECURITY'],
  ['review', 'POST', '/ops-tickets/:id/review', 'AUDIT'],
  ['cancel', 'POST', '/ops-tickets/:id/cancel', 'SECURITY'],
] as const)
  api(`system.ops-ticket.${action}`, method, path, roleType)
api('system.ops-ticket.evidence', 'POST', '/ops-tickets/:id/evidence', 'SECURITY')
api('system.ops-ticket.executions', 'POST', '/ops-tickets/:id/executions', 'SECURITY')
api('system.operation-policy.read', 'GET', '/security/operation-policies', 'SECURITY')
api('system.operation-policy.manage', 'POST', '/security/operation-policies', 'SECURITY')
api(
  'system.operation-policy.activate',
  'POST',
  '/security/operation-policies/:id/activate',
  'SECURITY'
)
api(
  'system.operation-policy.disable',
  'PATCH',
  '/security/operation-policies/:id/disable',
  'SECURITY'
)

export const SHARED_ADMIN_CODES = [
  'system.approval.read',
  'system.approval.detail',
  'page.system.approval',
  'system.ops-ticket.read',
  'system.ops-ticket.detail',
]
export function roleAllowsPermission(
  roleType: string,
  permission: { code: string; requiredRoleType: string }
) {
  if (/^system\..+\.field\./.test(permission.code)) return ['SECURITY', 'SYSTEM'].includes(roleType)
  if (
    permission.code === 'system.ops-ticket.read' ||
    permission.code === 'system.ops-ticket.detail'
  )
    return ['SECURITY', 'SYSTEM', 'AUDIT'].includes(roleType)
  if (SHARED_ADMIN_CODES.includes(permission.code)) return ['SECURITY', 'AUDIT'].includes(roleType)
  if (
    [
      'system.ops-ticket.create',
      'system.ops-ticket.update',
      'system.ops-ticket.submit',
      'system.ops-ticket.approve',
      'system.ops-ticket.execute',
      'system.ops-ticket.cancel',
      'system.ops-ticket.evidence',
      'system.ops-ticket.executions',
    ].includes(permission.code)
  )
    return ['SECURITY', 'SYSTEM'].includes(roleType)
  return roleType === permission.requiredRoleType
}
