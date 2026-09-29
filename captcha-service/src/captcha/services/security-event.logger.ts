import { createHash } from 'node:crypto'

type SecurityEvent = {
  operationCode: string
  action: string
  result: 'SUCCESS' | 'FAILURE'
  code?: string
  retryable?: boolean
  requestId?: string
  traceId?: string
  attemptId?: string
  sceneId?: string
  clientIp?: string
  subject?: string
  durationMs?: number
  rateLimited?: boolean
  dependency?: string
}

const digest = (value: unknown) =>
  createHash('sha256')
    .update(`${process.env.CAPTCHA_LOG_HASH_SECRET || 'captcha-log-hash-v1'}:${String(value || '')}`)
    .digest('hex')
    .slice(0, 32)

const maskIp = (value?: string) => {
  if (!value) return undefined
  if (value.includes(':')) return `${value.split(':').slice(0, 3).join(':')}:*`
  const parts = value.split('.')
  return parts.length === 4 ? `${parts.slice(0, 3).join('.')}.*` : '[MASKED]'
}

/** Never include secrets, tokens, answers, tracks, Redis keys or full User-Agent. */
export function logSecurityEvent(event: SecurityEvent) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'captcha-service',
    instance: process.env.CAPTCHA_INSTANCE_ID || process.env.HOSTNAME || 'unknown',
    environment: process.env.NODE_ENV || 'development',
    operationCode: event.operationCode,
    action: event.action,
    result: event.result,
    code: event.code,
    retryable: event.retryable,
    traceId: event.traceId ? digest(event.traceId) : undefined,
    requestId: event.requestId ? digest(event.requestId) : undefined,
    attemptId: event.attemptId ? digest(event.attemptId) : undefined,
    sceneId: event.sceneId,
    subjectHash: event.subject ? digest(event.subject) : undefined,
    clientIp: maskIp(event.clientIp),
    durationMs: event.durationMs,
    rateLimited: event.rateLimited,
    dependency: event.dependency,
  }))
}
