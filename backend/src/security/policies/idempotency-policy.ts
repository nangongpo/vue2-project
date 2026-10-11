/**
 * 幂等策略模式：
 * - SHORT_LOCK：只防止同一业务请求在短时间内并发执行，不保存响应，不支持重放。
 * - FULL：绑定请求指纹，并缓存成功响应，允许客户端在网络重试时安全重放。
 */
export enum IdempotencyMode {
  SHORT_LOCK = 'short-lock',
  FULL = 'full',
}

export type IdempotencyRoutePolicy = {
  mode: IdempotencyMode
  fingerprintTtlSeconds: number
}

const RESPONSE_TTL_SECONDS = 900
const SHORT_LOCK_TTL_SECONDS = 15

function isSafeMethod(method: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method)
}

/**
 * 集中维护路由策略，守卫本身只执行策略，不在业务代码中复制锁逻辑。
 * 未列出的写接口默认不启用幂等，避免误把认证或一次性操作纳入响应缓存。
 */
export function getIdempotencyRoutePolicy(method: string, path: string): IdempotencyRoutePolicy | null {
  if (isSafeMethod(method)) return null

  // 登录、MFA、重新认证和续签涉及一次性因子或 Cookie，只允许短时并发锁。
  if (
    path === '/api/v1/auth/login' ||
    path === '/api/v1/auth/login/complete' ||
    path.startsWith('/api/v1/auth/mfa/') ||
    path === '/api/v1/auth/reauth' ||
    path === '/api/v1/auth/session/renew'
  ) {
    return { mode: IdempotencyMode.SHORT_LOCK, fingerprintTtlSeconds: SHORT_LOCK_TTL_SECONDS }
  }

  // 登出、验证码和文件分片已有各自的一次性/分片语义，不使用通用幂等守卫。
  if (path === '/api/v1/auth/logout' || path.startsWith('/api/v1/captcha/')) return null
  if (/^\/api\/v1\/files\/uploads\/[^/]+\/parts\/[^/]+$/.test(path)) return null

  // 业务写接口支持完整幂等：同一 Key + 同一请求指纹可重放成功响应。
  if (
    path === '/api/v1/auth/tenant' ||
    path === '/api/v1/auth/password' ||
    path.startsWith('/api/v1/users') ||
    path.startsWith('/api/v1/roles') ||
    path.startsWith('/api/v1/permission/') ||
    path.startsWith('/api/v1/ops-tickets') ||
    path.startsWith('/api/v1/files')
  ) {
    return { mode: IdempotencyMode.FULL, fingerprintTtlSeconds: RESPONSE_TTL_SECONDS }
  }

  return null
}
