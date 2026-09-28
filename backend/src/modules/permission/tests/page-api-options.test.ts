import { describe, expect, it, vi } from 'vitest'
import { PermissionService } from '#app/modules/permission/services/permission.service.js'

describe('PermissionService page API options', () => {
  it('returns all active GET APIs', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const service = new PermissionService({ permission: { findMany } } as any)

    await expect(service.pageApiOptions()).resolves.toMatchObject({ data: [] })
    expect(findMany).toHaveBeenCalledWith({
      where: {
        type: 'API',
        status: 'ACTIVE',
        method: 'GET',
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

  it('includes the role grants read API', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'api-grants-read',
        code: 'system.role.grants.read',
        name: '查询角色授权',
        resource: 'system.role',
        action: 'grants.read',
        method: 'GET',
        path: '/api/v1/roles/:id/grants',
        status: 'ACTIVE',
        type: 'API',
      },
    ])
    const service = new PermissionService({ permission: { findMany } } as any)

    const result = await service.pageApiOptions()

    expect(result.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'system.role.grants.read' }),
    ]))
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
    expect(items[0]).toMatchObject({ isActive: true, statusLabel: '启用', isSystemBuiltin: true })
    expect(items[0]).not.toHaveProperty('status')
  })
})
