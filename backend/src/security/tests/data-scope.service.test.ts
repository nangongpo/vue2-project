import { describe, expect, it, vi } from 'vitest'
import { DataScopeService } from '../services/data-scope.service.js'

function fixture(scopes: string[] = ['SELF']) {
  const user: any = {
    id: 1n,
    userId: 'user-a',
    status: 'ACTIVE',
    tenantId: 'tenant-a',
    tenant: { status: 'ACTIVE' },
    departmentId: 'dept-a',
    organizationId: 'org-a',
    roles: [{ role: { dataScopes: scopes.map((scopeType) => ({ scopeType })), elevatedDataScopes: [] } }],
  }
  const db: any = {
    user: { findUnique: vi.fn(async () => user), findFirst: vi.fn(async () => null) },
    department: {
      findFirst: vi.fn(async () => ({ id: 'dept-a' })),
      findMany: vi.fn(async () => []),
    },
    organization: {
      findFirst: vi.fn(async () => ({ id: 'org-a' })),
      findMany: vi.fn(async () => []),
    },
  }
  db.$transaction = vi.fn(async (fn: any) => fn(db))
  return { user, db, service: new DataScopeService(db) }
}
describe('data scope enforcement', () => {
  it('always scopes SELF to authenticated tenant and owner', async () => {
    const f = fixture()
    expect(await f.service.where({ internalId: 1n }, 'order')).toEqual({
      AND: [{ tenantId: 'tenant-a' }, { ownerId: 'user-a' }],
    })
  })
  it('intersects conflicting scopes instead of broadening them', async () => {
    const f = fixture(['SELF', 'TENANT', 'DEPARTMENT_SELF'])
    expect(await f.service.where({ internalId: 1n }, 'order')).toEqual({
      AND: [{ tenantId: 'tenant-a' }, { ownerId: 'user-a' }, { departmentId: 'dept-a' }],
    })
  })
  it.each(['SELF', 'DEPARTMENT_SELF', 'DEPARTMENT_TREE', 'ORGANIZATION_SELF', 'ORGANIZATION_TREE', 'TENANT'])(
    'keeps tenant boundary for %s',
    async (type) => {
      const f = fixture([type])
      expect((await f.service.where({ internalId: 1n }, 'order')).AND?.[0]).toEqual({
        tenantId: 'tenant-a',
      })
    }
  )
  it('does not traverse descendants for SELF department', async () => {
    const f = fixture(['DEPARTMENT_SELF'])
    await f.service.where({ internalId: 1n }, 'order')
    expect(f.db.department.findMany).not.toHaveBeenCalled()
  })
  it('loads department tree with protected tenant and organization', async () => {
    const f = fixture(['DEPARTMENT_TREE'])
    f.db.department.findMany.mockResolvedValueOnce([{ id: 'dept-b' }]).mockResolvedValueOnce([])
    expect((await f.service.where({ internalId: 1n }, 'order')).AND).toContainEqual({
      departmentId: { in: ['dept-a', 'dept-b'] },
    })
    expect(f.db.department.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-a', organizationId: 'org-a' }),
      })
    )
  })
  it('rejects cycles and missing organization master records', async () => {
    const f = fixture(['ORGANIZATION_TREE'])
    f.db.organization.findMany.mockResolvedValue([{ id: 'org-a' }])
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
    f.db.organization.findFirst.mockResolvedValue(null)
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
  })
  it('does not run a repository operation without a scope', async () => {
    const f = fixture([]),
      operation = vi.fn()
    await expect(f.service.execute({ internalId: 1n }, 'order', {}, operation)).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled()
  })
  it('combines client filters with AND without accepting tenant overrides', async () => {
    const f = fixture(),
      operation = vi.fn(async (_tx, args) => args)
    const result = await f.service.execute({ internalId: 1n }, 'order', { tenantId: 'attacker-tenant' }, operation)
    expect(result).toEqual({
      where: {
        AND: [{ AND: [{ tenantId: 'tenant-a' }, { ownerId: 'user-a' }] }, { tenantId: 'attacker-tenant' }],
      },
    })
  })
  it.each(['DISABLED', 'LOCKED'])('rejects %s accounts', async (status) => {
    const f = fixture()
    f.user.status = status
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
  })
  it('rejects missing tenant and disabled tenant', async () => {
    const f = fixture()
    f.user.tenant.status = 'DISABLED'
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
    f.user.tenantId = null
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
  })
  it('ALL remains time limited and tenant bounded', async () => {
    const f = fixture([])
    f.user.roles[0].role.elevatedDataScopes = [
      {
        scopeType: 'ALL',
        approvalRef: 'approval',
        reason: 'reviewed',
        validFrom: new Date(0),
        expiresAt: new Date(Date.now() + 60000),
        targets: [],
      },
    ]
    expect(await f.service.where({ internalId: 1n }, 'order')).toEqual({
      AND: [{ tenantId: 'tenant-a' }],
    })
    f.user.roles[0].role.elevatedDataScopes[0].approvalRef = null
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
  })
  it('rejects custom target outside current tenant', async () => {
    const f = fixture([])
    f.user.roles[0].role.elevatedDataScopes = [
      {
        scopeType: 'CUSTOM',
        approvalRef: 'approval',
        reason: 'reviewed',
        validFrom: new Date(0),
        expiresAt: new Date(Date.now() + 60000),
        targets: [{ targetType: 'TENANT', targetId: 'another-tenant' }],
      },
    ]
    await expect(f.service.where({ internalId: 1n }, 'order')).rejects.toThrow()
  })
})
