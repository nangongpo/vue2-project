import { describe, expect, it } from 'vitest'
import { PasswordService } from '../services/password.service.js'
import { scryptSync } from 'node:crypto'

// Keep memory-hard operations sequential, including under a concurrent test default.
describe.sequential('PasswordService', () => {
  it('hashes and verifies a password without storing the raw value', async () => {
    const service = new PasswordService()
    const encoded = await service.hash('Strong-password-123!')
    expect(encoded).toMatch(/^scrypt\$131072\$8\$1\$/)
    expect(await service.verify('Strong-password-123!', encoded)).toBe(true)
    expect(await service.verify('wrong-password', encoded)).toBe(false)
  }, 20_000)

  it('rejects malformed hashes', async () => {
    await expect(new PasswordService().verify('password', 'invalid')).resolves.toBe(false)
  })

  it('still verifies existing weak passwords without applying the new strength policy', async () => {
    const salt = Buffer.alloc(16, 1)
    const hash = scryptSync('legacy', salt, 64, { N: 16384, r: 8, p: 1 })
    await expect(
      new PasswordService().verify('legacy', `scrypt$16384$8$1$${salt.toString('base64url')}$${hash.toString('base64url')}`)
    ).resolves.toBe(true)
  })

  it('rejects corrupted costs, lengths, encodings, and trailing fields before deriving', async () => {
    const service = new PasswordService()
    // Canonical fields are enough to test malformed metadata; no expensive hash needed.
    const encoded = `scrypt$131072$8$1$${Buffer.alloc(16).toString('base64url')}$${Buffer.alloc(64).toString('base64url')}`
    for (const invalid of [
      encoded.replace('$131072$', '$1073741824$'),
      encoded.replace('$8$', '$999999$'),
      encoded.replace('$1$', '$999999$'),
      encoded.replace('$131072$', '$16385$'),
      encoded.replace('$131072$', '$32768$'),
      encoded.replace('$131072$', '$262144$'),
      encoded + '$extra',
      encoded + '=',
      encoded.slice(0, -1),
      'scrypt$131072$8$1$$',
      encoded.replace('$131072$', '$NaN$'),
    ])
      await expect(service.verify('Strong-password-123!', invalid)).resolves.toBe(false)
  })

  it('never normalizes or trims password input', async () => {
    const service = new PasswordService()
    const password = '  Ａbcdefghi12!  '
    const encoded = await service.hash(password)
    expect(await service.verify(password, encoded)).toBe(true)
    expect(await service.verify(password.normalize('NFKC'), encoded)).toBe(false)
    expect(await service.verify(password.trim(), encoded)).toBe(false)
  }, 20_000)

  it('enforces strength for every new hash', async () => {
    await expect(new PasswordService().hash('weak')).rejects.toThrow('12 至 128')
  })
})
