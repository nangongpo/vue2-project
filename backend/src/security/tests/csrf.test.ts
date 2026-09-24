import { describe, expect, it, afterEach } from 'vitest'
import { assertSameOrigin } from '../policies/csrf.js'

const originalAllowedOrigins = process.env.CSRF_ALLOWED_ORIGINS

afterEach(() => {
  if (originalAllowedOrigins === undefined) delete process.env.CSRF_ALLOWED_ORIGINS
  else process.env.CSRF_ALLOWED_ORIGINS = originalAllowedOrigins
})

function request(origin?: string) {
  return {
    headers: {
      host: 'api.example.test',
      ...(origin ? { origin } : {}),
    },
    protocol: 'https',
  }
}

describe('CSRF origin validation', () => {
  it('allows a configured frontend origin', () => {
    process.env.CSRF_ALLOWED_ORIGINS = 'https://app.example.test'
    expect(() => assertSameOrigin(request('https://app.example.test'))).not.toThrow()
  })

  it('rejects an untrusted cross-site origin', () => {
    process.env.CSRF_ALLOWED_ORIGINS = 'https://app.example.test'
    expect(() => assertSameOrigin(request('https://attacker.example.test'))).toThrow('跨站请求来源不受信任')
  })

  it('keeps non-browser clients compatible when Origin is absent', () => {
    process.env.CSRF_ALLOWED_ORIGINS = 'https://app.example.test'
    expect(() => assertSameOrigin(request())).not.toThrow()
  })
})
