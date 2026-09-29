import { ALL_API_DEFINITIONS } from '#app/security/policies/permission-catalog/target-index.js'

type AuditActionInput = {
  action?: string | null
  operationCode?: string | null
  method?: string | null
  path?: string | null
}

const DECLARED_ACTIONS = [
  ['GET', '/api/v1/audit-logs', 'audit.logs.list'],
  ['GET', '/api/v1/audit-logs/export', 'audit.logs.export'],
  ['GET', '/api/v1/audit-logs/:id', 'audit.logs.detail'],
  ['GET', '/api/v1/audit-logs/:id/integrity', 'audit.logs.integrity'],
  ['POST', '/api/v1/auth/login', 'auth.login'],
  ['POST', '/api/v1/auth/login/complete', 'auth.login.complete'],
  ['POST', '/api/v1/auth/logout', 'auth.logout'],
  ['GET', '/api/v1/auth/sessions', 'auth.sessions.list'],
  ['DELETE', '/api/v1/auth/sessions/:id', 'auth.sessions.revoke'],
  ['GET', '/api/v1/auth/me', 'auth.me'],
  ['POST', '/api/v1/auth/password', 'auth.password.change'],
  ['GET', '/api/v1/auth/mfa/status', 'auth.mfa.status'],
  ['POST', '/api/v1/auth/mfa/enroll', 'auth.mfa.enroll'],
  ['POST', '/api/v1/auth/mfa/confirm', 'auth.mfa.confirm'],
  ['POST', '/api/v1/auth/reauth', 'auth.reauthenticate'],
  ['POST', '/api/v1/auth/session/renew', 'auth.session.renew'],
  ['GET', '/api/v1/permission/roles/:roleId/data-scopes', 'system.data-scope.read'],
  ['POST', '/api/v1/permission/roles/:roleId/data-scopes', 'system.data-scope.update'],
  ['PATCH', '/api/v1/permission/roles/:roleId/data-scopes/:scopeId/revoke', 'system.data-scope.revoke'],
] as const

function routeMatches(pattern: string, path: string) {
  const patternParts = pattern.split('/').filter(Boolean)
  const pathParts = path.split('/').filter(Boolean)
  return patternParts.length === pathParts.length && patternParts.every((part, index) => part.startsWith(':') || part === pathParts[index])
}

function routeAction(method: string, path: string) {
  const declared = DECLARED_ACTIONS.find(([declaredMethod, pattern]) => declaredMethod === method && routeMatches(pattern, path))
  if (declared) return declared[2]
  return ALL_API_DEFINITIONS.find((entry) => entry.method === method && routeMatches(entry.path, path))?.code
}

/** Keep the public audit operation type as a stable operation code, never an HTTP label. */
export function normalizeAuditAction(input: AuditActionInput) {
  const method = String(input.method || '').toUpperCase()
  const path = String(input.path || '').split('?')[0]
  if (input.operationCode) return input.operationCode
  const mapped = method && path ? routeAction(method, path) : undefined
  if (mapped) return mapped
  if (input.action && !/^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\//i.test(input.action)) return input.action
  return `http.${method.toLowerCase() || 'unknown'}`
}
