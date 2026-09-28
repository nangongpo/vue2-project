import type { RoleType } from '#app/common/types/prisma-enums.js'
import type { PermissionRolePolicy } from '#app/security/policies/permission-catalog/types.js'

const OPS_TICKET_READ_POLICY: PermissionRolePolicy = {
  type: 'ROLE_ALLOWLIST',
  roleTypes: ['SECURITY', 'SYSTEM', 'AUDIT'],
}
const OPS_TICKET_OPERATE_POLICY: PermissionRolePolicy = {
  type: 'ROLE_ALLOWLIST',
  roleTypes: ['SECURITY', 'SYSTEM'],
}
const OPS_TICKET_REVIEW_POLICY: PermissionRolePolicy = { type: 'SINGLE_ROLE', roleType: 'AUDIT' }
const APPROVAL_READ_POLICY: PermissionRolePolicy = {
  type: 'ROLE_ALLOWLIST',
  roleTypes: ['SECURITY', 'AUDIT'],
}

export const PAGE_PERMISSION_ROLE_POLICIES: Readonly<Record<string, PermissionRolePolicy>> = {
  'page.system.ops-tickets': OPS_TICKET_READ_POLICY,
  'page.system.approval': APPROVAL_READ_POLICY,
}

export const MANAGEMENT_PERMISSION_ROLE_POLICIES: Readonly<Record<string, PermissionRolePolicy>> = {
  'system.role.revoke': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.role.review': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.user.mfa-reset': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.audit.review': { type: 'SINGLE_ROLE', roleType: 'AUDIT' },
}

export const DATA_FIELD_ROLE_POLICIES: Readonly<Record<string, readonly RoleType[]>> = {
  'system.audit': ['AUDIT'],
  'system.approval': ['SECURITY', 'AUDIT'],
}

export {
  APPROVAL_READ_POLICY,
  OPS_TICKET_OPERATE_POLICY,
  OPS_TICKET_READ_POLICY,
  OPS_TICKET_REVIEW_POLICY,
}
