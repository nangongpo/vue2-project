import { describe, expect, it } from 'vitest'
import { canonicalize, signRequest } from '../protocol/protocol.js'

describe('internal request signature', () => {
  it('sorts and RFC3986-encodes every parameter except Signature', () => {
    const body = { Z: 'a b', A: 'x/y', Signature: 'ignored' }
    expect(canonicalize(body)).toBe('A=x%2Fy&Z=a%20b')
    expect(signRequest('post', body, 'secret')).toBe('aeGaeLDh/Zx/O61RhHp611QDF3/CIx/WYge36oUUjsg=')
  })
})
