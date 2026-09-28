import { RoleType, type RiskLevel } from '#app/common/types/prisma-enums.js'

export type { RiskLevel }

export type PermissionRolePolicy =
  | { type: 'SINGLE_ROLE'; roleType: RoleType }
  | { type: 'ROLE_ALLOWLIST'; roleTypes: readonly RoleType[] }

export type PermissionTarget = { resource: string; action: string }

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

export type RiskBaseline = {
  riskLevel: RiskLevel
  requireMfa: boolean
  requireReauth: boolean
  requireApproval: boolean
  requireDualControl: boolean
  auditRequired: boolean
}

export type ApiDefinition = {
  code: string
  name: string
  method: HttpMethod
  path: string
  resource: string
  action: string
  rolePolicy: PermissionRolePolicy
  riskBaseline: RiskBaseline
}
