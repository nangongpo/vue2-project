import { BUSINESS_APIS, BUSINESS_RESOURCE_CODES } from '#app/security/policies/permission-catalog/business-apis.js'
import { SYSTEM_APIS } from '#app/security/policies/permission-catalog/system-apis.js'
import type { ApiDefinition, PermissionTarget } from '#app/security/policies/permission-catalog/types.js'

export type { ApiDefinition, PermissionTarget, RiskBaseline } from '#app/security/policies/permission-catalog/types.js'

export function permissionTargetKey({ resource, action }: PermissionTarget) {
  return `${resource}\0${action}`
}

export function matchesPermissionTarget(left: PermissionTarget, right: PermissionTarget) {
  return permissionTargetKey(left) === permissionTargetKey(right)
}

export const API_CATALOG = { system: SYSTEM_APIS, business: BUSINESS_APIS } as const
export const ALL_API_DEFINITIONS: readonly ApiDefinition[] = Object.freeze([
  ...API_CATALOG.system,
  ...API_CATALOG.business,
])
export const API_BY_CODE = new Map(ALL_API_DEFINITIONS.map((entry) => [entry.code, entry]))
export const API_BY_TARGET = new Map(ALL_API_DEFINITIONS.map((entry) => [permissionTargetKey(entry), entry]))

export function allApiDefinitions() {
  return ALL_API_DEFINITIONS
}

export { BUSINESS_APIS, BUSINESS_RESOURCE_CODES, SYSTEM_APIS }
export const BUSINESS_API_CODES = new Set(BUSINESS_APIS.map((entry) => entry.code))
export const SYSTEM_API_CODES = new Set(SYSTEM_APIS.map((entry) => entry.code))
