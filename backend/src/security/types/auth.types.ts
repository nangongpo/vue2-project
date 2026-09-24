export type AuthenticatedUser = {
  internalId: bigint
  userId: string
  username: string
  displayName: string
  status: string
  failedLogins: number
  lastLoginAt: Date | null
  lastLoginIp: string | null
  roles: Array<{ roleId: string; code: string; name: string; roleType: string }>
  permissions: string[]
  apiPermissions?: Array<{
    code: string
    method: string | null
    path: string | null
    requiredRoleType: string
  }>
  mfaEnabled?: boolean
  mfaRequired?: boolean
  mfaVerifiedAt?: Date | null
  reauthenticatedAt?: Date | null
  tenantId?: string | null
  departmentId?: string | null
  organizationId?: string | null
  /** 仅供后端授权守卫使用，控制器响应中必须移除。 */
  isSuperAdmin: boolean
}
