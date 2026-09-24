import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common'
import { PermissionService } from '../services/permission.service.js'
import type { MutationContext } from '../services/permission.service.js'

const req: MutationContext = {
  user: { internalId: 7n, userId: 'actor-public-id', roles: ['SECURITY'] },
  traceId: 'test-trace',
  method: 'PATCH',
  url: '/api/v1/permission/functions/page/apis?ignored=yes',
  ip: '127.0.0.1',
}
const api = {
  id: 'read',
  code: 'order.read',
  name: 'Read orders',
  type: 'API',
  status: 'ACTIVE',
  method: 'GET',
  path: '/api/v1/orders',
  resource: 'order',
  action: 'read',
  requiredRoleType: 'BUSINESS',
}
const page = {
  id: 'page',
  code: 'page.order',
  name: 'Orders',
  route: '/orders',
  parentId: null as string | null,
  permissionId: 'page-permission',
  status: 'ACTIVE',
}
const button = {
  id: 'button',
  functionId: 'page',
  permissionId: 'button-permission',
  status: 'ACTIVE',
}

// A transaction harness records commit/rollback and restores staged writes on error.
// This checks service transaction boundaries; it is not a database integration test.
function fixture() {
  let state = {
    apis: [structuredClone(api)],
    pages: [structuredClone(page)],
    buttons: [structuredClone(button)],
    pageEdges: [{ functionId: 'page', apiId: 'old' }],
    buttonEdges: [{ buttonId: 'button', apiId: 'old' }],
    audits: [] as unknown[],
  }
  const tx = {
    permission: {
      findUnique: vi.fn(async ({ where }: any) => state.apis.find((p) => p.id === where.id) || null),
      findMany: vi.fn(async ({ where }: any) =>
        state.apis.filter(
          (p) => where.id.in.includes(p.id) && p.type === where.type && p.status === where.status && !where.code.notIn.includes(p.code)
        )
      ),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'new', ...data }
        state.apis.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.apis.find((p) => p.id === where.id)
        if (row) Object.assign(row, data)
        return { id: where.id, ...data }
      }),
      delete: vi.fn(async ({ where }: any) => {
        state.apis = state.apis.filter((p) => p.id !== where.id)
      }),
    },
    systemFunction: {
      findUnique: vi.fn(async ({ where }: any) => state.pages.find((p) => p.id === where.id) || null),
      findMany: vi.fn(async () => structuredClone(state.pages)),
      create: vi.fn(async ({ data }: any) => {
        const row = { id: 'new-page', ...data }
        state.pages.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = state.pages.find((p) => p.id === where.id)!
        const after = { ...row, ...data }
        state.pages = state.pages.map((p) => (p.id === where.id ? after : p))
        return after
      }),
    },
    functionButton: {
      findUnique: vi.fn(async ({ where }: any) => state.buttons.find((b) => b.id === where.id) || null),
      create: vi.fn(async ({ data }: any) => ({ id: 'new-button', ...data })),
      update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
    },
    functionApi: {
      findMany: vi.fn(async () => structuredClone(state.pageEdges)),
      deleteMany: vi.fn(async () => {
        state.pageEdges = []
      }),
      createMany: vi.fn(async ({ data }: any) => {
        state.pageEdges.push(...data)
      }),
      count: vi.fn().mockResolvedValue(0),
    },
    buttonApi: {
      findMany: vi.fn(async () => structuredClone(state.buttonEdges)),
      deleteMany: vi.fn(async () => {
        state.buttonEdges = []
      }),
      createMany: vi.fn(async ({ data }: any) => {
        state.buttonEdges.push(...data)
      }),
      count: vi.fn().mockResolvedValue(0),
    },
    rolePermission: { count: vi.fn().mockResolvedValue(0) },
    auditLog: {
      create: vi.fn(async (input: unknown) => {
        state.audits.push(input)
      }),
    },
  }
  const lifecycle = { commits: 0, rollbacks: 0 }
  const prisma = {
    $transaction: vi.fn(async (fn: any) => {
      const snapshot = structuredClone(state)
      try {
        const result = await fn(tx)
        lifecycle.commits++
        return result
      } catch (error) {
        state = snapshot
        lifecycle.rollbacks++
        throw error
      }
    }),
  }
  return {
    tx,
    prisma,
    lifecycle,
    state: () => state,
    service: new PermissionService(prisma as any),
  }
}

describe('PermissionService security boundaries', () => {
  it('binds explicit read APIs in a serializable transaction with before/after audit', async () => {
    const f = fixture()
    await f.service.mapFunctionApis('page', ['read'], req)
    expect(f.state().pageEdges).toEqual([{ functionId: 'page', apiId: 'read' }])
    expect(f.tx.buttonApi.createMany).not.toHaveBeenCalled()
    expect(f.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
    expect(f.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: 7n,
        traceId: 'test-trace',
        path: '/api/v1/permission/functions/page/apis',
        action: 'page.bind-api',
        detail: expect.objectContaining({
          before: [{ functionId: 'page', apiId: 'old' }],
          after: { id: 'page', apiIds: ['read'] },
        }),
      }),
    })
    expect(f.lifecycle).toEqual({ commits: 1, rollbacks: 0 })
  })

  it.each([
    { method: 'POST', action: 'create' },
    { method: 'PATCH', action: 'update' },
    { method: 'DELETE', action: 'delete' },
    { method: 'GET', action: 'export' },
    { method: 'GET', action: 'approve' },
  ])('rejects write/export/approval APIs as page initialization bindings: %j', async (override) => {
    const f = fixture()
    Object.assign(f.state().apis[0], override)
    await expect(f.service.mapFunctionApis('page', ['read'], req)).rejects.toBeInstanceOf(BadRequestException)
    expect(f.tx.functionApi.deleteMany).not.toHaveBeenCalled()
    expect(f.state().pageEdges).toEqual([{ functionId: 'page', apiId: 'old' }])
    expect(f.tx.auditLog.create).not.toHaveBeenCalled()
  })

  it('allows an explicitly bound write API on a button without changing page bindings', async () => {
    const f = fixture()
    Object.assign(f.state().apis[0], { method: 'POST', action: 'create' })
    await f.service.mapButtonApis('button', ['read'], req)
    expect(f.state().buttonEdges).toEqual([{ buttonId: 'button', apiId: 'read' }])
    expect(f.state().pageEdges).toEqual([{ functionId: 'page', apiId: 'old' }])
    expect(f.tx.auditLog.create).toHaveBeenCalled()
  })

  it.each([{ status: 'DISABLED' }, { type: 'PAGE' }, { code: '*' }, { code: 'system.permission.manage' }, { id: 'other' }])(
    'rejects disabled, retired, wrong-type and missing API bindings: %j',
    async (override) => {
      const f = fixture()
      Object.assign(f.state().apis[0], override)
      await expect(f.service.mapButtonApis('button', ['read'], req)).rejects.toBeInstanceOf(BadRequestException)
      expect(f.tx.buttonApi.deleteMany).not.toHaveBeenCalled()
    }
  )

  it('rejects binding through a disabled button or disabled owning page', async () => {
    const f = fixture()
    f.state().buttons[0].status = 'DISABLED'
    await expect(f.service.mapButtonApis('button', ['read'], req)).rejects.toBeInstanceOf(NotFoundException)
    f.state().buttons[0].status = 'ACTIVE'
    f.state().pages[0].status = 'DISABLED'
    await expect(f.service.mapButtonApis('button', ['read'], req)).rejects.toBeInstanceOf(NotFoundException)
    await expect(f.service.mapFunctionApis('page', ['read'], req)).rejects.toBeInstanceOf(NotFoundException)
    expect(f.tx.buttonApi.deleteMany).not.toHaveBeenCalled()
  })

  it.each(['page', 'button'] as const)('rolls back %s bindings if the mandatory audit write fails', async (kind) => {
    const f = fixture()
    const before = structuredClone(f.state())
    f.tx.auditLog.create.mockRejectedValue(new Error('Audit storage unavailable'))
    const operation = kind === 'page' ? f.service.mapFunctionApis('page', ['read'], req) : f.service.mapButtonApis('button', ['read'], req)
    await expect(operation).rejects.toThrow('Audit storage unavailable')
    expect(f.tx[kind === 'page' ? 'functionApi' : 'buttonApi'].createMany).toHaveBeenCalled()
    expect(f.lifecycle).toEqual({ commits: 0, rollbacks: 1 })
    expect(f.state()).toEqual(before)
  })

  it('rolls back resource creation when its mandatory audit fails', async () => {
    const f = fixture()
    f.tx.auditLog.create.mockRejectedValue(new Error('Audit storage unavailable'))
    await expect(
      f.service.createApi(
        {
          code: 'order.create',
          name: 'Create',
          method: 'POST',
          path: '/api/v1/orders',
          resource: 'order',
          action: 'create',
        },
        req
      )
    ).rejects.toThrow('Audit storage unavailable')
    expect(f.tx.permission.create).toHaveBeenCalled()
    expect(f.state().apis).toEqual([api])
    expect(f.lifecycle.commits).toBe(0)
  })

  it.each(['self', 'descendant', 'existing-cycle'] as const)('rejects %s page hierarchy cycles before mutating', async (kind) => {
    const f = fixture()
    if (kind !== 'self')
      f.state().pages.push({
        ...page,
        id: 'child',
        parentId: kind === 'descendant' ? 'page' : 'child',
      })
    await expect(f.service.updateFunction('page', { parentId: kind === 'self' ? 'page' : 'child' }, req)).rejects.toBeInstanceOf(
      BadRequestException
    )
    expect(f.tx.systemFunction.update).not.toHaveBeenCalled()
    expect(f.lifecycle.commits).toBe(0)
  })

  it('rejects a missing or disabled new parent', async () => {
    const f = fixture()
    await expect(f.service.updateFunction('page', { parentId: 'missing' }, req)).rejects.toBeInstanceOf(NotFoundException)
    f.state().pages.push({ ...page, id: 'disabled', status: 'DISABLED' })
    await expect(f.service.updateFunction('page', { parentId: 'disabled' }, req)).rejects.toBeInstanceOf(NotFoundException)
    expect(f.tx.systemFunction.update).not.toHaveBeenCalled()
  })

  it('allows an acyclic parent change and records the original parent', async () => {
    const f = fixture()
    f.state().pages.push({ ...page, id: 'new-parent' })
    await f.service.updateFunction('page', { parentId: 'new-parent' }, req)
    expect(f.state().pages[0].parentId).toBe('new-parent')
    expect(f.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        detail: expect.objectContaining({
          before: expect.objectContaining({ parentId: null }),
          after: expect.objectContaining({ parentId: 'new-parent' }),
        }),
      }),
    })
  })

  it.each(['code', 'route', 'method_path'])('returns conflict on database %s uniqueness violations', async (target) => {
    const f = fixture()
    const error = { code: 'P2002', meta: { target } }
    if (target === 'route') {
      f.tx.systemFunction.create.mockRejectedValue(error)
      await expect(f.service.createFunction({ code: 'page.new', name: 'New', route: '/orders' }, req)).rejects.toBeInstanceOf(
        ConflictException
      )
      expect(f.state().apis).toEqual([api])
    } else {
      f.tx.permission.create.mockRejectedValue(error)
      await expect(
        f.service.createApi(
          {
            code: 'order.new',
            name: 'New',
            method: 'GET',
            path: '/api/v1/orders',
            resource: 'order',
            action: 'read',
          },
          req
        )
      ).rejects.toBeInstanceOf(ConflictException)
    }
    expect(f.lifecycle.commits).toBe(0)
  })

  it.each(['functionApi', 'buttonApi', 'rolePermission'] as const)(
    'does not delete APIs referenced by %s, including historical role grants',
    async (reference) => {
      const f = fixture()
      f.tx[reference].count.mockResolvedValue(1)
      await expect(f.service.deleteApi('read', req)).rejects.toBeInstanceOf(ConflictException)
      expect(f.tx.permission.delete).not.toHaveBeenCalled()
      expect(f.tx.rolePermission.count).toHaveBeenCalledWith({ where: { permissionId: 'read' } })
    }
  )

  it('audits deletion of unreferenced APIs and rolls deletion back on audit failure', async () => {
    const f = fixture()
    f.tx.auditLog.create.mockRejectedValueOnce(new Error('Audit unavailable'))
    await expect(f.service.deleteApi('read', req)).rejects.toThrow('Audit unavailable')
    expect(f.state().apis).toEqual([api])
    await f.service.deleteApi('read', req)
    expect(f.state().apis).toEqual([])
    expect(f.tx.auditLog.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        action: 'api.delete',
        detail: expect.objectContaining({ before: api, after: null }),
      }),
    })
  })

  it.each(['P2003', 'P2034'])('surfaces concurrent reference/write conflict %s safely', async (code) => {
    const f = fixture()
    f.tx.permission.delete.mockRejectedValue({ code })
    await expect(f.service.deleteApi('read', req)).rejects.toBeInstanceOf(ConflictException)
    expect(f.lifecycle.commits).toBe(0)
  })

  it.each([
    { method: 'ALL' },
    { path: '/api/v1/orders/*' },
    { path: '/api/v1/orders?all=true' },
    { path: '/api/v1/%75sers' },
    { code: '*' },
    { code: 'system.permission.manage' },
    { path: '/api/v1/users' },
    { code: 'system.user.read' },
  ])('rejects broad, ambiguous and protected API definitions: %j', async (override) => {
    const f = fixture()
    await expect(
      f.service.createApi(
        {
          code: 'order.new',
          name: 'New',
          method: 'GET',
          path: '/api/v1/orders',
          resource: 'order',
          action: 'read',
          ...override,
        },
        req
      )
    ).rejects.toBeInstanceOf(BadRequestException)
    expect(f.tx.permission.create).not.toHaveBeenCalled()
  })

  it('prevents API metadata edits from changing security resource/action', async () => {
    const f = fixture()
    await expect(f.service.updateApi('read', { resource: 'user' }, req)).rejects.toBeInstanceOf(BadRequestException)
    await expect(f.service.updateApi('read', { action: 'delete' }, req)).rejects.toBeInstanceOf(BadRequestException)
    expect(f.tx.permission.update).not.toHaveBeenCalled()
  })

  it.each(['page', 'button'] as const)('propagates %s disabled status to its permission atomically', async (kind) => {
    const f = fixture()
    await f.service.setStatus(kind, kind, 'DISABLED', req)
    expect(f.tx.permission.update).toHaveBeenCalledWith({
      where: { id: `${kind}-permission` },
      data: { status: 'DISABLED' },
    })
    expect(f.tx.auditLog.create).toHaveBeenCalled()
  })
})
