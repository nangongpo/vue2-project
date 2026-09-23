import { describe, expect, it } from 'vitest'
import { sanitizeAuditRequest } from './audit-sanitizer.js'

describe('audit sanitizer', () => {
  it('redacts sensitive fields and truncates oversized values', () => {
    const result = sanitizeAuditRequest(
      { keyword: 'admin', token: 'secret-token', page: '1' },
      { password: 'plain-password', displayName: 'A'.repeat(600) },
    ) as any

    expect(result.query).toEqual({ keyword: 'admin', token: '[REDACTED]', page: '1' })
    expect(result.body.password).toBe('[REDACTED]')
    expect(result.body.displayName).toMatch(/\[TRUNCATED\]$/)
  })
})
