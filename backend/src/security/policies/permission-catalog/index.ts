import { RoleType } from '#app/common/types/prisma-enums.js'
import {
  API_BY_CODE,
  API_BY_TARGET,
  ALL_API_DEFINITIONS,
  BUSINESS_API_CODES,
  BUSINESS_APIS,
  BUSINESS_RESOURCE_CODES,
  SYSTEM_API_CODES,
  SYSTEM_APIS,
  allApiDefinitions,
  matchesPermissionTarget,
  permissionTargetKey,
  type ApiDefinition,
} from '#app/security/policies/permission-catalog/target-index.js'
import type { PermissionTarget } from '#app/security/policies/permission-catalog/types.js'
import {
  DATA_FIELD_ROLE_POLICIES,
  MANAGEMENT_PERMISSION_ROLE_POLICIES,
  PAGE_PERMISSION_ROLE_POLICIES,
} from '#app/security/policies/permission-catalog/role-policies.js'
import type { PermissionRolePolicy } from '#app/security/policies/permission-catalog/types.js'
import {
  MANAGEMENT_API_ROOTS,
  MANAGEMENT_RESOURCE_ALIASES,
  MANAGEMENT_RESOURCES,
  apiRoot,
  isManagementApiPath,
  isManagementResource,
} from '#app/security/policies/permission-catalog/management-boundary.js'

export {
  API_BY_CODE, API_BY_TARGET, ALL_API_DEFINITIONS, BUSINESS_API_CODES, BUSINESS_APIS, BUSINESS_RESOURCE_CODES,
  SYSTEM_API_CODES, SYSTEM_APIS, allApiDefinitions, matchesPermissionTarget, permissionTargetKey,
  DATA_FIELD_ROLE_POLICIES, MANAGEMENT_PERMISSION_ROLE_POLICIES, PAGE_PERMISSION_ROLE_POLICIES,
  MANAGEMENT_API_ROOTS, MANAGEMENT_RESOURCE_ALIASES, MANAGEMENT_RESOURCES, apiRoot,
  isManagementApiPath, isManagementResource,
}
export type { ApiDefinition, PermissionRolePolicy, PermissionTarget }

export function isCatalogManagementCode(code: string) {
  const entry = API_BY_CODE.get(code)
  return SYSTEM_API_CODES.has(code) && !!entry && isManagementResource(entry.resource)
}

export function allowedRoleTypesForPermission(permission: {
  code: string
  type?: string
  resource?: string
  action?: string
  rolePolicy?: PermissionRolePolicy
  roleTypes?: readonly { roleType: string }[]
}): readonly RoleType[] {
  const catalogCode = permission.code.startsWith('button.') ? permission.code.slice('button.'.length) : permission.code
  const catalogEntry = permission.resource && permission.action
    ? API_BY_TARGET.get(permissionTargetKey({ resource: permission.resource, action: permission.action }))
    : API_BY_CODE.get(catalogCode)
  const catalogPolicy = permission.rolePolicy || catalogEntry?.rolePolicy || MANAGEMENT_PERMISSION_ROLE_POLICIES[catalogCode]
  if (permission.roleTypes !== undefined) return permission.roleTypes.map((item) => item.roleType as RoleType)
  if (permission.type === 'FIELD') {
    const resource = permission.code.split('.field.')[0]
    return DATA_FIELD_ROLE_POLICIES[resource] || ['SECURITY', 'SYSTEM']
  }
  return catalogPolicy?.type === 'ROLE_ALLOWLIST'
    ? catalogPolicy.roleTypes
    : PAGE_PERMISSION_ROLE_POLICIES[catalogCode]?.type === 'ROLE_ALLOWLIST'
    ? PAGE_PERMISSION_ROLE_POLICIES[catalogCode].roleTypes
    : catalogPolicy ? [catalogPolicy.roleType] : []
}

export function roleAllowsPermission(roleType: string, permission: Parameters<typeof allowedRoleTypesForPermission>[0]) {
  return allowedRoleTypesForPermission(permission).includes(roleType as RoleType)
}
