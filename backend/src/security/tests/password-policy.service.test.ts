import { afterEach, describe, expect, it, vi } from 'vitest'
import { assertPasswordStrength, PasswordPolicyService, PASSWORD_MIN_AGE_MS } from '../services/password-policy.service.js'
import { PasswordService } from '../services/password.service.js'

afterEach(() => vi.useRealTimers())

describe('password strength', () => {
  it.each(['Abcdefghij1!', 'correct horse battery staple', '松林 山川 河流 明月 星辰 大海 清风 春雨'])(
    'accepts complexity or a long passphrase: %s',
    (password) => {
      expect(() => assertPasswordStrength(password)).not.toThrow()
    }
  )
  it.each([
    'Abcdefghi1!',
    'a'.repeat(128),
    'A1!' + 'x'.repeat(126),
    'word word word word word',
    '1234 5678 9012 3456 7890',
    'Abcdefghij1!\n',
  ])('rejects invalid passwords: %s', (password) => {
    expect(() => assertPasswordStrength(password)).toThrow()
  })
  it('accepts the 128-character boundary and counts Unicode code points', () => {
    expect(() => assertPasswordStrength('A1!' + 'x'.repeat(125))).not.toThrow()
    expect(() => assertPasswordStrength('Aa1' + '😀'.repeat(125))).not.toThrow()
    expect(() => assertPasswordStrength('Aa1' + '😀'.repeat(126))).toThrow()
  })
})

function fixture(changedAt: Date | null = null) {
  const user = { id: 1n, passwordHash: 'current', passwordChangedAt: changedAt }
  const passwords = {
    verify: vi.fn().mockResolvedValue(false),
    hash: vi.fn().mockResolvedValue('next-salted-hash'),
  }
  const tx = {
    user: { update: vi.fn() },
    passwordHistory: {
      findMany: vi
        .fn()
        .mockResolvedValueOnce([{ passwordHash: 'old' }])
        .mockResolvedValueOnce([{ id: 6n }, { id: 5n }, { id: 4n }, { id: 3n }, { id: 2n }]),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  }
  return { user, passwords, tx, policy: new PasswordPolicyService(passwords as any) }
}

describe.sequential('PasswordPolicyService', () => {
  it('allows an initial change, archives only the old hash and retains five historical passwords', async () => {
    const { policy, user, passwords, tx } = fixture()
    await policy.replace(tx as any, user, 'New-password-123!')
    expect(passwords.verify.mock.calls).toEqual([
      ['New-password-123!', 'current'],
      ['New-password-123!', 'old'],
    ])
    expect(tx.passwordHistory.create).toHaveBeenCalledWith({
      data: { userId: 1n, passwordHash: 'current', createdAt: expect.any(Date) },
    })
    expect(tx.passwordHistory.deleteMany).toHaveBeenCalledWith({
      where: { userId: 1n, id: { notIn: [6n, 5n, 4n, 3n, 2n] } },
    })
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 1n },
      data: { passwordHash: 'next-salted-hash', passwordChangedAt: expect.any(Date) },
    })
  })
  it.each(['current', 'old'])('rejects reuse of %s without writing', async (reused) => {
    const { policy, user, passwords, tx } = fixture()
    passwords.verify.mockImplementation(async (_password, hash) => hash === reused)
    await expect(policy.replace(tx as any, user, 'New-password-123!')).rejects.toThrow('历史密码')
    expect(passwords.hash).not.toHaveBeenCalled()
    expect(tx.passwordHistory.create).not.toHaveBeenCalled()
  })
  it('checks independently salted real hashes rather than comparing newly generated hashes', async () => {
    const passwords = new PasswordService()
    const old = await passwords.hash('Old-password-123!')
    const { user, tx } = fixture()
    user.passwordHash = await passwords.hash('Current-password-123!')
    tx.passwordHistory.findMany.mockReset().mockResolvedValue([{ passwordHash: old }])
    await expect(new PasswordPolicyService(passwords).replace(tx as any, user, 'Old-password-123!')).rejects.toThrow('历史密码')
  }, 20_000)
  it('rejects changes before 24 hours, including future timestamps', async () => {
    for (const age of [0, PASSWORD_MIN_AGE_MS - 1, -60_000]) {
      vi.useFakeTimers().setSystemTime(new Date('2026-09-23T00:00:00Z'))
      const { policy, tx, user } = fixture(new Date(Date.now() - age))
      await expect(policy.replace(tx as any, user, 'New-password-123!')).rejects.toThrow('24 小时')
      expect(tx.passwordHistory.findMany).not.toHaveBeenCalled()
    }
  })
  it('allows the exact 24-hour boundary', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-09-23T00:00:00Z'))
    const { policy, tx, user } = fixture(new Date(Date.now() - PASSWORD_MIN_AGE_MS))
    await expect(policy.replace(tx as any, user, 'New-password-123!')).resolves.toBeUndefined()
  })
  it('administrative reset bypasses age but still checks history', async () => {
    const { policy, tx, user, passwords } = fixture(new Date())
    passwords.verify.mockResolvedValue(true)
    await expect(policy.replace(tx as any, user, 'New-password-123!', false)).rejects.toThrow('历史密码')
    expect(tx.user.update).not.toHaveBeenCalled()
  })
})
