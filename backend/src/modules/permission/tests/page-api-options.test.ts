import { describe, expect, it, vi } from 'vitest'
import { PermissionService } from '#app/modules/permission/services/permission.service.js'

describe('PermissionService page API options', () => {
  const systemPage = {
    id: 'system-page',
    code: 'page.system.user',
    nodeType: 'PAGE',
    permission: { roleTypes: [{ roleType: 'SYSTEM' }] },
  }

  it('returns only system active GET APIs for a system page', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const service = new PermissionService({
      systemFunction: { findUnique: vi.fn().mockResolvedValue(systemPage) },
      permission: { findMany },
    } as any)

    await expect(service.pageApiOptions('system-page')).resolves.toMatchObject({ data: [] })
    expect(findMany).toHaveBeenCalledWith({
      where: {
        type: 'API',
        status: 'ACTIVE',
        method: 'GET',
        action: { in: ['read', 'list', 'detail', 'init', 'options', 'references', 'grants.read'] },
        code: { in: expect.any(Array) },
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

  it('includes system role grants read API for a system page', async () => {
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
    const service = new PermissionService({
      systemFunction: { findUnique: vi.fn().mockResolvedValue(systemPage) },
      permission: { findMany },
    } as any)

    const result = await service.pageApiOptions('system-page')

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
    const service = new PermissionService({
      systemFunction: { findUnique: vi.fn().mockResolvedValue(systemPage) },
      permission: { findMany },
    } as any)

    const result = await service.pageApiOptions('system-page')
    const items = result.data as any[]
    expect(items[0]).toMatchObject({ isActive: true, statusLabel: '启用', isSystemBuiltin: true, scope: 'SYSTEM' })
    expect(items[0]).not.toHaveProperty('status')
  })

  it('excludes system APIs from business page options', async () => {
    const findMany = vi.fn().mockResolvedValue([])
    const service = new PermissionService({
      systemFunction: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'business-page',
          code: 'page.business.file-upload',
          nodeType: 'PAGE',
          permission: { roleTypes: [{ roleType: 'BUSINESS' }] },
        }),
      },
      permission: { findMany },
    } as any)

    await service.pageApiOptions('business-page')
    const call = findMany.mock.calls[0][0]
    expect(call.where.code.notIn).toEqual(expect.arrayContaining(['system.user.read']))
    expect(call.where.code.notIn).not.toContain('file.upload.status')
  })
})
