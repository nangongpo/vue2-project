const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'passwordhash',
  'authorization',
  'cookie',
  'setcookie',
  'token',
  'accesstoken',
  'refreshtoken',
  'captchatoken',
  'sessionid',
  'secret',
  'mfasecret',
  'clientsecret',
  'privatekey',
  'accesskey',
  'otp',
  'totp',
  'recoverycode',
  'uri',
])
const MAX_DEPTH = 4
const MAX_STRING_LENGTH = 512
const MAX_COLLECTION_SIZE = 50

export function sanitizeAuditValue(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEYS.has(key.toLowerCase().replaceAll('-', '').replaceAll('_', ''))) return '[REDACTED]'
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : value
  if (depth >= MAX_DEPTH) return '[TRUNCATED]'
  if (Array.isArray(value)) return value.slice(0, MAX_COLLECTION_SIZE).map((item) => sanitizeAuditValue(item, key, depth + 1))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_COLLECTION_SIZE)
      .reduce<Record<string, unknown>>((result, [entryKey, entryValue]) => {
        result[entryKey] = sanitizeAuditValue(entryValue, entryKey, depth + 1)
        return result
      }, {})
  }
  return `[${typeof value}]`
}

/** Sanitize any detail before it is persisted to the audit log. */
export function sanitizeAuditDetail(value: unknown) {
  const sanitized = sanitizeAuditValue(value)
  return sanitized === undefined ? null : sanitized
}

export function sanitizeAuditRequest(query: unknown, body: unknown) {
  return {
    query: sanitizeAuditValue(query),
    body: sanitizeAuditValue(body),
  }
}
