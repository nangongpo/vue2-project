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
  'page.system.file': { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM'] },
}

export const MANAGEMENT_PERMISSION_ROLE_POLICIES: Readonly<Record<string, PermissionRolePolicy>> = {
  'system.role.revoke': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.role.review': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.user.mfa-reset': { type: 'SINGLE_ROLE', roleType: 'SECURITY' },
  'system.audit.review': { type: 'SINGLE_ROLE', roleType: 'AUDIT' },
}

export const DATA_FIELD_ROLE_POLICIES: Readonly<Record<string, readonly RoleType[]>> = {
  file: ['BUSINESS'],
  'file.upload': ['BUSINESS'],
  'file.upload.part': ['BUSINESS'],
  'system.audit': ['AUDIT'],
  'system.audit.actor': ['AUDIT'],
  'system.approval': ['SECURITY', 'AUDIT'],
  'system.approval.actor': ['SECURITY', 'AUDIT'],
  'system.file': ['SECURITY', 'SYSTEM'],
  'system.file.binding': ['SECURITY', 'SYSTEM'],
  'system.file.scan-result': ['SECURITY', 'SYSTEM'],
  'system.file.upload': ['SECURITY', 'SYSTEM'],
  'system.health.service': ['SECURITY', 'SYSTEM'],
  'system.ops-ticket.evidence': ['SECURITY', 'SYSTEM', 'AUDIT'],
  'system.ops-ticket.execution': ['SECURITY', 'SYSTEM', 'AUDIT'],
}

export {
  APPROVAL_READ_POLICY,
  OPS_TICKET_OPERATE_POLICY,
  OPS_TICKET_READ_POLICY,
  OPS_TICKET_REVIEW_POLICY,
}
