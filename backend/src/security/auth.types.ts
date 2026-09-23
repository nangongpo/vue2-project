export type AuthenticatedUser = {
  internalId: bigint
  userId: string
  username: string
  displayName: string
  status: string
  failedLogins: number
  lastLoginAt: Date | null
  lastLoginIp: string | null
  roles: Array<{ roleId: string; code: string; name: string }>
  permissions: string[]
  /** 仅供后端授权守卫使用，控制器响应中必须移除。 */
  isSuperAdmin: boolean
}
