import { describe, expect, it } from 'vitest'
import { sanitizeAuditRequest } from '../utils/audit-sanitizer.js'

describe('audit sanitizer', () => {
  it('redacts nested MFA codes, enrollment secrets and import URIs', () => {
    expect(
      sanitizeAuditRequest(
        {},
        {
          otp: '123456',
          nested: {
            totp: '654321',
            secret: 'base32',
            uri: 'otpauth://totp/example',
            recoveryCode: 'backup',
          },
        }
      )
    ).toEqual({
      query: {},
      body: {
        otp: '[REDACTED]',
        nested: {
          totp: '[REDACTED]',
          secret: '[REDACTED]',
          uri: '[REDACTED]',
          recoveryCode: '[REDACTED]',
        },
      },
    })
  })
  it('redacts sensitive fields and truncates oversized values', () => {
    const result = sanitizeAuditRequest(
      { keyword: 'admin', token: 'secret-token', page: '1' },
      { password: 'plain-password', displayName: 'A'.repeat(600) }
    ) as any

    expect(result.query).toEqual({ keyword: 'admin', token: '[REDACTED]', page: '1' })
    expect(result.body.password).toBe('[REDACTED]')
    expect(result.body.displayName).toMatch(/\[TRUNCATED\]$/)
  })
})
