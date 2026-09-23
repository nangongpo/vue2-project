const SENSITIVE_KEY = /(password|passwd|token|secret|cookie|authorization|credential|private.?key|access.?key|refresh.?token)/i
const MAX_DEPTH = 4
const MAX_STRING_LENGTH = 512
const MAX_COLLECTION_SIZE = 50

export function sanitizeAuditValue(value: unknown, key = '', depth = 0): unknown {
  if (SENSITIVE_KEY.test(key)) return '[REDACTED]'
  if (value === null || value === undefined || typeof value === 'boolean' || typeof value === 'number') return value
  if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...[TRUNCATED]` : value
  if (depth >= MAX_DEPTH) return '[TRUNCATED]'
  if (Array.isArray(value)) return value.slice(0, MAX_COLLECTION_SIZE).map(item => sanitizeAuditValue(item, key, depth + 1))
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).slice(0, MAX_COLLECTION_SIZE).reduce<Record<string, unknown>>((result, [entryKey, entryValue]) => {
      result[entryKey] = sanitizeAuditValue(entryValue, entryKey, depth + 1)
      return result
    }, {})
  }
  return `[${typeof value}]`
}

export function sanitizeAuditRequest(query: unknown, body: unknown) {
  return {
    query: sanitizeAuditValue(query),
    body: sanitizeAuditValue(body),
  }
}
