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
  navigation?: Array<{
    path: string
    title: string
    icon: string | null
    props: unknown
  }>
  apiPermissions?: Array<{
    code: string
    method: string | null
    path: string | null
  }>
  mfaEnabled?: boolean
  mfaRequired?: boolean
  mfaVerifiedAt?: Date | null
  reauthenticatedAt?: Date | null
  /** 当前登录会话的绝对过期时间，仅用于前端提前提示，不用于授权判断。 */
  sessionExpiresAt?: Date | null
  tenantId?: string | null
  departmentId?: string | null
  organizationId?: string | null
}
