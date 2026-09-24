import { ForbiddenException } from '@nestjs/common'

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin
  } catch {
    return ''
  }
}

/**
 * Cookie-authenticated state-changing requests must come from an approved web origin.
 * Requests without Origin are kept compatible with non-browser clients; browser
 * cross-site requests include Origin and are rejected when it does not match.
 */
export function assertSameOrigin(request: { headers: Record<string, string | string[] | undefined>; protocol?: string }) {
  const rawOrigin = request.headers.origin
  const origin = typeof rawOrigin === 'string' ? normalizeOrigin(rawOrigin) : ''
  if (!origin) return

  const configuredOrigins = String(process.env.CSRF_ALLOWED_ORIGINS || '')
    .split(',')
    .map((item) => normalizeOrigin(item.trim()))
    .filter(Boolean)

  const host = request.headers.host
  const forwardedProto = request.headers['x-forwarded-proto']
  const protocol = typeof forwardedProto === 'string' ? forwardedProto.split(',')[0].trim() : request.protocol || 'http'
  const sameOrigin = host ? normalizeOrigin(`${protocol}://${host}`) : ''
  const allowedOrigins = configuredOrigins.length ? configuredOrigins : [sameOrigin]

  if (!allowedOrigins.includes(origin)) {
    throw new ForbiddenException('跨站请求来源不受信任')
  }
}
