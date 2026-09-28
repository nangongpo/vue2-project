export const MANAGEMENT_RESOURCES = new Set([
  'system.user', 'system.role', 'system.permission', 'system.permission.field',
  'system.page', 'system.page.api', 'system.button', 'system.button.api',
  'system.api', 'system.audit', 'system.approval', 'system.data-scope',
  'system.data-resource', 'system.field', 'system.ops-ticket',
  'system.operation-policy', 'system.session', 'system.config', 'system.runtime',
])

export const MANAGEMENT_RESOURCE_ALIASES = new Set([
  'user', 'users', 'role', 'roles', 'permission', 'permissions', 'audit', 'audits',
])

export const MANAGEMENT_API_ROOTS = new Set([
  '/api/v1/permission', '/api/v1/users', '/api/v1/roles',
  '/api/v1/audit', '/api/v1/audit-logs', '/api/v1/auth',
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
