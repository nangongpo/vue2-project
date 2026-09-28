import { describe, expect, it, afterEach } from 'vitest'
import { assertSameOrigin } from '#app/security/policies/csrf.js'

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

  it('rejects requests without an explicit Origin', () => {
    process.env.CSRF_ALLOWED_ORIGINS = 'https://app.example.test'
    expect(() => assertSameOrigin(request())).toThrow('缺少可信请求来源')
  })

  it('rejects requests when the trusted origin list is not configured', () => {
    delete process.env.CSRF_ALLOWED_ORIGINS
    expect(() => assertSameOrigin(request('https://app.example.test'))).toThrow('未配置可信请求来源')
  })
})
