import { describe, expect, it, vi } from 'vitest'
import { ConflictException } from '@nestjs/common'
import { RoleService } from './role.service.js'

describe('RoleService', () => {
  it('lists roles with user counts', async () => {
    const prisma = { role: { findMany: vi.fn().mockResolvedValue([{ id: 'r1', publicId: 'public-role-1', code: 'admin', permissions: [], _count: { users: 1 } }]) } }
    const result = await new RoleService(prisma as any).list()
    expect(result).toMatchObject({ code: '000000', data: [{ code: 'admin' }] })
  })

  it('converts duplicate role codes to a conflict error', async () => {
    const prisma = { role: { create: vi.fn().mockRejectedValue({ code: 'P2002' }) } }
    const service = new RoleService(prisma as any)
    await expect(service.create({ code: 'admin', name: 'Admin' })).rejects.toBeInstanceOf(ConflictException)
  })
})
