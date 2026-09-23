import { describe, expect, it } from 'vitest'
import { PasswordService } from './password.service.js'

describe('PasswordService', () => {
  it('hashes and verifies a password without storing the raw value', async () => {
    const service = new PasswordService()
    const encoded = await service.hash('Strong-password-123!')
    expect(encoded).toMatch(/^scrypt\$/)
    expect(await service.verify('Strong-password-123!', encoded)).toBe(true)
    expect(await service.verify('wrong-password', encoded)).toBe(false)
  })

  it('rejects malformed hashes', async () => {
    await expect(new PasswordService().verify('password', 'invalid')).resolves.toBe(false)
  })
})
