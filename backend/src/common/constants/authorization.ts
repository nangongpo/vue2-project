import { BadRequestException } from '@nestjs/common'

export const MAX_AUTHORIZATION_TTL_DAYS = 90
export const MAX_AUTHORIZATION_TTL_MS = MAX_AUTHORIZATION_TTL_DAYS * 24 * 60 * 60 * 1000

export function parseAuthorizationExpiry(value: string | undefined, now = new Date()) {
  if (typeof value !== 'string' || !value.trim()) throw new BadRequestException('必须设置授权到期时间')
  const expiresAt = new Date(value)
  if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= now)
    throw new BadRequestException('授权到期时间必须在未来')
  if (expiresAt.getTime() - now.getTime() > MAX_AUTHORIZATION_TTL_MS)
    throw new BadRequestException(`授权期限不能超过 ${MAX_AUTHORIZATION_TTL_DAYS} 天`)
  return expiresAt
}
