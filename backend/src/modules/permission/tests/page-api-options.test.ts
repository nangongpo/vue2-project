import { describe, expect, it, vi } from 'vitest'
import { PermissionService } from '../services/permission.service.js'

describe('PermissionService page API options', () => {
  it('returns only active GET read-like APIs and excludes retired codes', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const service = new PermissionService({ permission: { findMany } } as any)

    await expect(service.pageApiOptions()).resolves.toMatchObject({ data: [] })
    expect(findMany).toHaveBeenCalledWith({
      where: {
        type: 'API',
        status: 'ACTIVE',
        method: 'GET',
        action: { in: ['read', 'list', 'detail', 'init', 'options', 'references'] },
        code: { notIn: expect.any(Array) },
      },
      orderBy: { code: 'asc' },
      select: expect.objectContaining({
        id: true,
        code: true,
        method: true,
        path: true,
      }),
    })
  })

  it('returns the safe API status projection used by the page binding UI', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'api-1',
        code: 'system.role.read',
        name: '查询角色',
        resource: 'system.role',
        action: 'read',
        method: 'GET',
        path: '/api/v1/roles',
        status: 'ACTIVE',
        type: 'API',
      },
    ])
    const service = new PermissionService({ permission: { findMany } } as any)

    const result = await service.pageApiOptions()
    const items = result.data as any[]
    expect(items[0]).toMatchObject({ isActive: true, statusLabel: '启用' })
    expect(items[0]).not.toHaveProperty('status')
  })
})
