import { describe, expect, it, vi } from 'vitest'
import { ConflictException } from '@nestjs/common'
import { UserService } from './user.service.js'

function createPrisma() {
  return {
    user: {
      count: vi.fn().mockResolvedValue(1),
      findMany: vi.fn().mockResolvedValue([{ id: 'u1', username: 'admin', roles: [] }]),
      create: vi.fn().mockResolvedValue({ id: 'u2', username: 'new-user' }),
    },
    $transaction: vi.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
  }
}

describe('UserService', () => {
  it('returns a paginated user result', async () => {
    const prisma = createPrisma()
    const service = new UserService(prisma as any, { hash: vi.fn() } as any)
    const result = await service.page({ keyword: 'adm', page: 2, pageSize: 10 })
    expect(result).toMatchObject({ code: '000000', data: { total: 1, page: 2, pageSize: 10 } })
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 10, take: 10 }))
  })

  it('hashes the initial password when creating a user', async () => {
    const prisma = createPrisma()
    const passwords = { hash: vi.fn().mockResolvedValue('hashed-password') }
    const service = new UserService(prisma as any, passwords as any)
    await service.create({ username: 'new-user', password: 'Strong-password-123!', displayName: 'New User' })
    expect(passwords.hash).toHaveBeenCalledWith('Strong-password-123!')
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'hashed-password' }) }))
  })

  it('converts duplicate usernames to a conflict error', async () => {
    const prisma = createPrisma()
    prisma.user.create.mockRejectedValue({ code: 'P2002' })
    const service = new UserService(prisma as any, { hash: vi.fn().mockResolvedValue('hash') } as any)
    await expect(service.create({ username: 'admin', password: 'Strong-password-123!', displayName: 'Admin' })).rejects.toBeInstanceOf(ConflictException)
  })
})
