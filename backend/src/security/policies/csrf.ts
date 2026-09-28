import { ForbiddenException } from '@nestjs/common'

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

/** Cookie-authenticated state-changing requests must include an approved web origin. */
export function assertSameOrigin(request: { headers: Record<string, string | string[] | undefined>; protocol?: string }) {
  const rawOrigin = request.headers.origin
  const origin = typeof rawOrigin === 'string' ? normalizeOrigin(rawOrigin) : ''
  if (!origin) throw new ForbiddenException('缺少可信请求来源')

  const configuredOrigins = String(process.env.CSRF_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOrigin(item.trim()))
    .filter(Boolean)

  if (!configuredOrigins.length) throw new ForbiddenException('未配置可信请求来源')

  if (!configuredOrigins.includes(origin)) {
    throw new ForbiddenException('跨站请求来源不受信任')
  }
}
