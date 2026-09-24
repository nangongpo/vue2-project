import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { ApprovalService, ApprovalActor, APPROVAL_MAX_TTL_MS } from '../services/approval.service.js'
import { approvalPayload, CreateApprovalDto } from '../dto/approval.dto.js'
import { ApprovalController } from '../controllers/approval.controller.js'
import { REQUIRED_PERMISSIONS } from '../../../security/decorators/permission.decorator.js'
import { PermissionGuard } from '../../../security/guards/permission.guard.js'

const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`
function actor(n = 1, roleType = 'SECURITY'): ApprovalActor {
  return {
    internalId: BigInt(n),
    userId: uuid(n),
    status: 'ACTIVE',
    roles: [{ roleId: uuid(100 + n), roleType }],
    permissions: [
      'system.role.grant',
      'system.role.revoke',
      'system.role.review',
      'system.user.mfa-reset',
      'system.audit.review',
      ...['create', 'read', 'detail', 'approve', 'execute', 'review'].map((action) => `system.approval.${action}`),
    ],
    mfaVerifiedAt: new Date(),
    reauthenticatedAt: new Date(),
  } as unknown as ApprovalActor
}
function input(
  kind: CreateApprovalDto['kind'] = 'ROLE_GRANT',
  payload: Record<string, unknown> = { userId: uuid(10), roleId: uuid(20) }
): CreateApprovalDto {
  return {
    kind,
    payload,
    reason: 'Temporary approved maintenance',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
}
function harness() {
  let request: any = null
  let grant: any = null
  let permissionGrants: any[] = []
  let scope: any = null
  let mfaUser: any = {
    id: 10n,
    userId: uuid(10),
    status: 'ACTIVE',
    expiresAt: null,
    mfaEnabled: true,
    mfaSecret: 'encrypted',
    mfaLastStep: 123n,
  }
  let sessions: any[] = [
    { id: 'session-1', userId: 10n, revokedAt: null },
    { id: 'session-2', userId: 10n, revokedAt: null },
  ]
  const role = { id: 20n, roleId: uuid(20), status: 'ACTIVE', roleType: 'SECURITY' }
  const permission = {
    id: uuid(30),
    status: 'ACTIVE',
    code: 'system.role.read',
    requiredRoleType: 'SECURITY',
    type: 'API',
    method: 'GET',
    path: '/api/v1/roles',
    resource: 'roles',
    action: 'read',
  }
  const matching = (row: any, where: any) =>
    (!where?.roleId || row.roleId === where.roleId) &&
    (!where?.permissionId?.in || where.permissionId.in.includes(row.permissionId)) &&
    (!where?.permissionId || typeof where.permissionId !== 'string' || where.permissionId === row.permissionId) &&
    (where?.revokedAt !== null || row.revokedAt === null)
  const tx: any = {
    approvalRequest: {
      create: vi.fn(
        async ({ data }) =>
          (request = {
            id: uuid(90),
            status: 'REQUESTED',
            approverId: null,
            executorId: null,
            reviewerId: null,
            ...data,
          })
      ),
      findUnique: vi.fn(async () => request && { ...request }),
      findUniqueOrThrow: vi.fn(async () => ({ ...request })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (request.status !== where.status || (where.expiresAt && request.expiresAt <= where.expiresAt.gt)) return { count: 0 }
        request = { ...request, ...data }
        return { count: 1 }
      }),
      findMany: vi.fn(async () => (request ? [request] : [])),
    },
    role: { findUnique: vi.fn(async () => role), findUniqueOrThrow: vi.fn(async () => role) },
    tenant: { findFirst: vi.fn(async () => ({ id: uuid(50) })) },
    organization: { findFirst: vi.fn(async () => ({ id: uuid(51) })) },
    department: { findFirst: vi.fn(async () => ({ id: uuid(52) })) },
    user: {
      findUnique: vi.fn(async ({ select }) =>
        select?.mfaEnabled ? { ...mfaUser } : { id: 10n, status: 'ACTIVE', expiresAt: null, roles: [] }
      ),
      findUniqueOrThrow: vi.fn(async ({ select }) => (select?.mfaEnabled ? { ...mfaUser } : { id: 10n })),
      findFirst: vi.fn(async () => ({ id: 10n })),
      updateMany: vi.fn(async ({ where, data }) => {
        if (
          where.id !== mfaUser.id ||
          where.mfaEnabled !== mfaUser.mfaEnabled ||
          where.mfaSecret !== mfaUser.mfaSecret ||
          where.mfaLastStep !== mfaUser.mfaLastStep
        )
          return { count: 0 }
        mfaUser = { ...mfaUser, ...data }
        return { count: 1 }
      }),
    },
    session: {
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0
        sessions = sessions.map((session) =>
          session.userId === where.userId && session.revokedAt === where.revokedAt ? (++count, { ...session, ...data }) : session
        )
        return { count }
      }),
    },
    userRole: {
      findFirst: vi.fn(async () => null),
      findUnique: vi.fn(async () => grant),
      findUniqueOrThrow: vi.fn(async () => grant),
      upsert: vi.fn(async ({ create }) => (grant = create)),
      updateMany: vi.fn(async ({ data }) => {
        if (!grant || grant.revokedAt) return { count: 0 }
        grant = { ...grant, ...data }
        return { count: 1 }
      }),
    },
    rolePermission: {
      findMany: vi.fn(async ({ where, include }) =>
        permissionGrants.filter((row) => matching(row, where)).map((row) => (include?.permission ? { ...row, permission } : row))
      ),
      count: vi.fn(async ({ where }) => permissionGrants.filter((row) => matching(row, where)).length),
      upsert: vi.fn(async ({ create }) => {
        permissionGrants.push(create)
        return create
      }),
      updateMany: vi.fn(async ({ where, data }) => {
        let count = 0
        permissionGrants = permissionGrants.map((row) => (matching(row, where) ? (++count, { ...row, ...data }) : row))
        return { count }
      }),
    },
    permission: {
      findUnique: vi.fn(async () => permission),
      findUniqueOrThrow: vi.fn(async () => permission),
      findMany: vi.fn(async () => [permission]),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ data }) => ({ ...permission, ...data })),
    },
    roleElevatedDataScope: {
      create: vi.fn(async ({ data }) => (scope = { id: uuid(91), revokedAt: null, ...data })),
      findUnique: vi.fn(async () => scope),
      findUniqueOrThrow: vi.fn(async () => scope),
      updateMany: vi.fn(async ({ data }) => {
        if (!scope || scope.revokedAt) return { count: 0 }
        scope = { ...scope, ...data }
        return { count: 1 }
      }),
    },
    auditLog: { create: vi.fn(async ({ data }) => data) },
  }
  const prisma: any = {
    ...tx,
    $transaction: vi.fn(async (fn: any) => {
      const oldRequest = request && { ...request }
      const oldGrant = grant
      const oldPermissions = [...permissionGrants]
      const oldScope = scope
      const oldMfaUser = { ...mfaUser }
      const oldSessions = sessions.map((session) => ({ ...session }))
      try {
        return await fn(tx)
      } catch (error) {
        request = oldRequest
        grant = oldGrant
        permissionGrants = oldPermissions
        scope = oldScope
        mfaUser = oldMfaUser
        sessions = oldSessions
        throw error
      }
    }),
  }
  const hasRoute = vi.fn(() => true)
  const service = new ApprovalService(prisma, {
    httpAdapter: { getInstance: () => ({ hasRoute }) },
  } as any)
  return {
    service,
    tx,
    prisma,
    role,
    permission,
    hasRoute,
    get request() {
      return request
    },
    get grant() {
      return grant
    },
    get permissionGrants() {
      return permissionGrants
    },
    get scope() {
      return scope
    },
    get mfaUser() {
      return mfaUser
    },
    get sessions() {
      return sessions
    },
  }
}

describe('high-risk revocation workflows', () => {
  async function execute(h: ReturnType<typeof harness>, request: CreateApprovalDto) {
    const { data } = await h.service.create(request, actor())
    await h.service.transition(data.id, 'approve', { note: 'independent review' }, actor(2))
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    return data
  }
  it('revokes high-risk role bindings even when role is disabled, preserving grant evidence', async () => {
    const h = harness()
    await execute(h, input())
    const assignedAt = h.grant.assignedAt
    h.role.status = 'DISABLED'
    await execute(h, input('ROLE_REVOKE'))
    expect(h.grant).toMatchObject({
      assignedAt,
      revokedBy: uuid(3),
      revokeReason: 'Temporary approved maintenance',
      revokedAt: expect.any(Date),
    })
  })
  it('revokes explicit permissions and prevents repeated execution', async () => {
    const h = harness(),
      payload = { roleId: uuid(20), permissionIds: [uuid(30)] }
    await execute(h, input('ROLE_PERMISSIONS', payload))
    const request = await execute(h, input('ROLE_PERMISSION_REVOKE', payload))
    expect(h.permissionGrants[0].revokedAt).toBeInstanceOf(Date)
    await expect(h.service.transition(request.id, 'execute', { note: 'again' }, actor(3))).rejects.toThrow('状态')
  })
  it('revokes elevated scopes with atomic audit provenance', async () => {
    const h = harness()
    h.tx.permission.findFirst.mockResolvedValue({ id: uuid(30) })
    await execute(
      h,
      input('ELEVATED_SCOPE', {
        roleId: uuid(20),
        resource: 'orders',
        scopeType: 'ALL',
        targets: [],
      })
    )
    await execute(h, input('ELEVATED_REVOKE', { scopeId: uuid(91) }))
    expect(h.scope.revokedAt).toBeInstanceOf(Date)
    const evidence = h.tx.auditLog.create.mock.calls.at(-1)![0].data.detail.after.mutation
    expect(evidence.revocation).toMatchObject({ revokedBy: uuid(3), approvalRef: uuid(90) })
  })
  it('requires the explicit revoke capability and blocks self-revocation', async () => {
    const h = harness(),
      applicant = actor()
    applicant.permissions = applicant.permissions.filter((code) => code !== 'system.role.revoke')
    await expect(h.service.create(input('ROLE_REVOKE'), applicant)).rejects.toThrow('显式权限')
    await expect(h.service.create(input('ROLE_REVOKE', { userId: uuid(1), roleId: uuid(20) }), actor())).rejects.toThrow('自己')
  })
  it('validates each CUSTOM target against its own protected master table', async () => {
    const h = harness()
    h.tx.permission.findFirst.mockResolvedValue({ id: uuid(30) })
    h.tx.department.findFirst.mockResolvedValue(null)
    await expect(
      h.service.create(
        input('ELEVATED_SCOPE', {
          roleId: uuid(20),
          resource: 'orders',
          scopeType: 'CUSTOM',
          targets: [{ targetType: 'DEPARTMENT', targetId: uuid(52) }],
        }),
        actor()
      )
    ).rejects.toThrow('目标不存在')
    expect(h.tx.department.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: uuid(52),
          status: 'ACTIVE',
          tenant: { status: 'ACTIVE' },
        }),
      })
    )
  })
  it('resets lost administrator MFA through independent approval and revokes sessions without auditing secrets', async () => {
    const h = harness()
    await execute(h, input('MFA_RESET', { userId: uuid(10) }))
    expect(h.mfaUser).toMatchObject({ mfaEnabled: false, mfaSecret: null, mfaLastStep: null })
    expect(h.sessions.every((session) => session.revokedAt instanceof Date)).toBe(true)
    const evidence = h.tx.auditLog.create.mock.calls.at(-1)![0].data.detail.after.mutation
    expect(evidence).toMatchObject({
      userId: uuid(10),
      mfaEnabled: false,
      hadMfaSecret: false,
      revokedSessions: 2,
      approvalRef: uuid(90),
    })
    expect(JSON.stringify(evidence)).not.toContain('encrypted')
  })
  it('requires explicit MFA reset capability and blocks target user participation', async () => {
    const h = harness(),
      applicant = actor()
    applicant.permissions = applicant.permissions.filter((code) => code !== 'system.user.mfa-reset')
    await expect(h.service.create(input('MFA_RESET', { userId: uuid(10) }), applicant)).rejects.toThrow('显式权限')
    await expect(h.service.create(input('MFA_RESET', { userId: uuid(1) }), actor())).rejects.toThrow('自己')
  })
})

describe('approval authorization and validation', () => {
  it.each(['SECURITY', 'AUDIT'])(
    'allows explicit shared list/detail reads for %s, including exact-route guard matching',
    async (roleType) => {
      const h = harness()
      const { data } = await h.service.create(input(), actor())
      const user = actor(4, roleType)
      for (const [handler, code, path] of [
        ['list', 'system.approval.read', '/api/v1/permission/approvals'],
        ['detail', 'system.approval.detail', '/api/v1/permission/approvals/:id'],
      ] as const) {
        const context: any = {
          getHandler: () => ApprovalController.prototype[handler],
          getClass: () => ApprovalController,
          switchToHttp: () => ({
            getRequest: () => ({
              method: 'GET',
              routeOptions: { url: path },
              user: {
                ...user,
                apiPermissions: [{ code, method: 'GET', path, requiredRoleType: 'BUSINESS' }],
              },
            }),
          }),
        }
        expect(await new PermissionGuard().canActivate(context)).toBe(true)
      }
      expect((await h.service.list({}, user)).data.items).toHaveLength(1)
      expect((await h.service.detail(data.id, user)).data.id).toBe(data.id)
    }
  )
  it.each(['BUSINESS', 'SYSTEM'])('denies shared approval reads for %s despite a BUSINESS-classified API grant', async (roleType) => {
    const h = harness()
    await expect(h.service.list({}, actor(4, roleType))).rejects.toThrow('显式权限')
    await expect(h.service.detail(uuid(90), actor(4, roleType))).rejects.toThrow('显式权限')
    expect(h.tx.approvalRequest.findMany).not.toHaveBeenCalled()
  })
  it('requires detail permission separately from list permission', async () => {
    const h = harness()
    const user = actor()
    user.permissions = ['system.approval.read']
    await expect(h.service.detail(uuid(90), user)).rejects.toThrow('显式权限')
    await expect(h.service.list({}, user)).resolves.toMatchObject({ data: { items: [] } })
  })
  it.each(['mfaVerifiedAt', 'reauthenticatedAt'] as const)('fails closed for missing, expired, invalid and future %s', async (field) => {
    for (const value of [undefined, new Date(Date.now() - 300_001), new Date(NaN), new Date(Date.now() + 60_000)]) {
      const h = harness()
      await expect(h.service.create(input(), { ...actor(), [field]: value })).rejects.toThrow('MFA')
      expect(h.prisma.$transaction).not.toHaveBeenCalled()
    }
  })
  it.each(['BUSINESS', 'SYSTEM', 'AUDIT'])('rejects %s creation even with all permission codes', async (type) => {
    await expect(harness().service.create(input(), actor(1, type))).rejects.toThrow('显式权限')
  })
  it('does not honor legacy superadmin bypass', async () => {
    await expect(
      harness().service.create(input(), {
        ...actor(),
        permissions: [],
        isSuperAdmin: true,
      } as ApprovalActor)
    ).rejects.toThrow('显式权限')
  })
  it('requires business capability in addition to route permission', async () => {
    const user = actor()
    user.permissions = user.permissions.filter((code) => code !== 'system.role.grant')
    await expect(harness().service.create(input(), user)).rejects.toThrow('显式权限')
  })
  it('rejects mixed administrator identities', async () => {
    const user = actor()
    user.roles.push(...actor(2, 'AUDIT').roles)
    await expect(harness().service.create(input(), user)).rejects.toThrow('显式权限')
  })
  it.each([-1, APPROVAL_MAX_TTL_MS + 60_000])('rejects expiry outside mandatory TTL: %d', async (delta) => {
    await expect(harness().service.create({ ...input(), expiresAt: new Date(Date.now() + delta).toISOString() }, actor())).rejects.toThrow(
      '有效期'
    )
  })
  it('rejects unknown top-level and payload fields, missing expiry and invalid UUIDs', async () => {
    for (const data of [
      { ...input(), applicantId: uuid(5) },
      { ...input(), expiresAt: undefined },
      input('ROLE_GRANT', { userId: '1', roleId: uuid(20) }),
      input('ROLE_GRANT', { userId: uuid(10), roleId: uuid(20), execute: 'DROP TABLE' }),
      input('MFA_RESET', { userId: uuid(10), mfaSecret: 'forged' }),
    ]) {
      await expect(harness().service.create(data as CreateApprovalDto, actor())).rejects.toThrow('参数')
    }
  })
  it('rejects duplicate permission UUIDs and mismatched scope targets', () => {
    expect(() => approvalPayload('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30), uuid(30)] })).toThrow()
    expect(() =>
      approvalPayload('ELEVATED_SCOPE', {
        roleId: uuid(20),
        resource: 'orders',
        scopeType: 'CUSTOM',
        targets: [],
      })
    ).toThrow()
    expect(() =>
      approvalPayload('ELEVATED_SCOPE', {
        roleId: uuid(20),
        resource: 'orders',
        scopeType: 'ALL',
        targets: [{ targetType: 'USER', targetId: uuid(10) }],
      })
    ).toThrow()
    expect(() =>
      approvalPayload('ELEVATED_SCOPE', {
        roleId: uuid(20),
        resource: 'orders',
        scopeType: 'CUSTOM',
        targets: [{ targetType: 'USER', targetId: uuid(10), unexpected: true }],
      })
    ).toThrow()
  })
})

describe('approval state machine and transaction guarantees', () => {
  it('completes request → approve → execute → review with atomic audit and grant provenance', async () => {
    const h = harness()
    const created = await h.service.create(input(), actor())
    await h.service.transition(created.data.id, 'approve', { note: 'approved' }, actor(2))
    await h.service.transition(created.data.id, 'execute', { note: 'executed' }, actor(3))
    const reviewed = await h.service.transition(created.data.id, 'review', { note: 'verified' }, actor(4, 'AUDIT'))
    expect(reviewed.data).toMatchObject({
      status: 'REVIEWED',
      applicantId: uuid(1),
      approverId: uuid(2),
      executorId: uuid(3),
      reviewerId: uuid(4),
    })
    expect(h.grant).toMatchObject({
      userId: 10n,
      roleId: 20n,
      grantedBy: uuid(3),
      approvalRef: created.data.id,
      expiresAt: created.data.expiresAt,
    })
    expect(h.tx.auditLog.create).toHaveBeenCalledTimes(4)
    const audit = h.tx.auditLog.create.mock.calls[2][0].data
    expect(audit.actorId).toBe(3n)
    expect(audit.detail).toMatchObject({
      actorId: '3',
      actorUserId: uuid(3),
      before: { mutation: null },
      after: { mutation: { grantedBy: uuid(3) } },
    })
    expect(h.prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    })
  })
  it('blocks self approval and out-of-order execution', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await expect(h.service.transition(data.id, 'approve', { note: 'approve' }, actor())).rejects.toThrow('申请人')
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))).rejects.toThrow('状态')
  })
  it('blocks reviewers matching applicant, approver or executor even if roles change', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    for (const n of [1, 2, 3])
      await expect(h.service.transition(data.id, 'review', { note: 'review' }, actor(n, 'AUDIT'))).rejects.toThrow('独立')
    await expect(h.service.transition(data.id, 'review', { note: 'review' }, actor(4))).rejects.toThrow('显式权限')
  })
  it('blocks target user at every stage', async () => {
    const h = harness()
    await expect(h.service.create(input('ROLE_GRANT', { userId: uuid(1), roleId: uuid(20) }), actor())).rejects.toThrow('自己')
    const { data } = await h.service.create(input(), actor())
    await expect(h.service.transition(data.id, 'approve', { note: 'approve' }, actor(10))).rejects.toThrow('自己')
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(10))).rejects.toThrow('自己')
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    await expect(h.service.transition(data.id, 'review', { note: 'review' }, actor(10, 'AUDIT'))).rejects.toThrow('自己')
  })
  it('compares actor UUIDs case-insensitively', async () => {
    const h = harness()
    const user = { ...actor(), userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }
    await expect(h.service.create(input('ROLE_GRANT', { userId: user.userId.toUpperCase(), roleId: uuid(20) }), user)).rejects.toThrow(
      '自己'
    )
  })
  it('rechecks target state and expiration at execution; permits post-expiry review', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    h.role.status = 'DISABLED'
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))).rejects.toThrow('停用')
    h.role.status = 'ACTIVE'
    h.request.expiresAt = new Date(Date.now() - 100)
    h.request.createdAt = new Date(Date.now() - 10_000)
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))).rejects.toThrow('过期')
    h.request.expiresAt = new Date(Date.now() + 1000)
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    h.request.expiresAt = new Date(Date.now() - 100)
    await expect(h.service.transition(data.id, 'review', { note: 'review' }, actor(4, 'AUDIT'))).resolves.toMatchObject({
      data: { status: 'REVIEWED' },
    })
  })
  it('rolls back both grant and state if the audit insert fails', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    h.tx.auditLog.create.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))).rejects.toThrow('audit unavailable')
    expect(h.request.status).toBe('APPROVED')
    expect(h.grant).toBeNull()
  })
  it('does not execute when compare-and-set loses a race', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    h.tx.approvalRequest.updateMany.mockResolvedValueOnce({ count: 0 })
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))).rejects.toThrow('其他操作')
    expect(h.tx.userRole.upsert).not.toHaveBeenCalled()
  })
  it('rolls back the claimed state if the target mutation fails', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    h.tx.userRole.upsert.mockRejectedValueOnce(new Error('write failed'))
    await expect(h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))).rejects.toThrow('write failed')
    expect(h.request.status).toBe('APPROVED')
    expect(h.tx.auditLog.create).toHaveBeenCalledTimes(2)
  })
  it('only one of two overlapping executions can mutate the grant', async () => {
    const h = harness()
    const { data } = await h.service.create(input(), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    // Deliberately allow both transactions to read APPROVED before CAS; no fake serial queue.
    h.prisma.$transaction.mockImplementation((fn: any) => fn(h.tx))
    const results = await Promise.allSettled([3, 5].map((n) => h.service.transition(data.id, 'execute', { note: 'execute' }, actor(n))))
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(h.tx.userRole.upsert).toHaveBeenCalledTimes(1)
    expect(h.request.status).toBe('EXECUTED')
  })
  it('maps database serialization failures to conflict without automatic mutation retry', async () => {
    const h = harness()
    h.prisma.$transaction.mockRejectedValue({ code: 'P2034' })
    await expect(h.service.create(input(), actor())).rejects.toThrow('数据已变化')
    expect(h.prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

describe('approval target policies', () => {
  it.each(['SECURITY', 'AUDIT'])('allows shared approval read grants to %s', async (roleType) => {
    const h = harness()
    h.role.roleType = roleType
    h.permission.code = 'system.approval.read'
    h.permission.path = '/api/v1/permission/approvals'
    h.permission.requiredRoleType = 'BUSINESS'
    await expect(
      h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())
    ).resolves.toMatchObject({ data: { status: 'REQUESTED' } })
  })
  it('denies cross-admin paths even when permission code and classification are misleading', async () => {
    const h = harness()
    h.permission.code = 'orders.read'
    h.permission.requiredRoleType = 'BUSINESS'
    h.permission.path = '/api/v1/audit'
    await expect(h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())).rejects.toThrow(
      '路径管理职责冲突'
    )
  })
  it('rejects incompatible administrator role grants', async () => {
    const h = harness()
    h.tx.user.findUnique.mockResolvedValue({
      id: 10n,
      status: 'ACTIVE',
      roles: [{ role: { status: 'ACTIVE', roleType: 'AUDIT' } }],
    })
    await expect(h.service.create(input(), actor())).rejects.toThrow('互斥')
  })
  it.each(['*', 'system.permission.manage', 'system.audit.delete'])('rejects forbidden permission %s', async (code) => {
    const h = harness()
    h.permission.code = code
    await expect(h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())).rejects.toThrow()
  })
  it('rejects admin API access for BUSINESS and cross-admin permissions', async () => {
    const h = harness()
    h.role.roleType = 'BUSINESS'
    h.permission.requiredRoleType = 'BUSINESS'
    await expect(h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())).rejects.toThrow(
      '业务角色'
    )
    h.role.roleType = 'SECURITY'
    h.permission.code = 'system.audit.read'
    await expect(h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())).rejects.toThrow(
      '职责冲突'
    )
  })
  it('blocks granting to a role held by any workflow participant', async () => {
    const h = harness()
    h.tx.userRole.findFirst.mockResolvedValue({ userId: 1n })
    await expect(h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())).rejects.toThrow(
      '本人受益'
    )
  })
  it('grants only explicitly submitted permission UUIDs with expiry and approval reference', async () => {
    const h = harness()
    const { data } = await h.service.create(input('ROLE_PERMISSIONS', { roleId: uuid(20), permissionIds: [uuid(30)] }), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    expect(h.tx.rolePermission.upsert).toHaveBeenCalledTimes(1)
    expect(h.tx.rolePermission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          permissionId: uuid(30),
          approvalRef: data.id,
          expiresAt: data.expiresAt,
        }),
      })
    )
  })
  it('requires a registered API route and forbids repurposing live role grants', async () => {
    const h = harness()
    const change = input('API_ROUTE_CHANGE', {
      apiId: uuid(30),
      code: 'system.role.details',
      method: 'GET',
      path: '/api/v1/roles/:roleId',
    })
    h.hasRoute.mockReturnValue(false)
    await expect(h.service.create(change, actor())).rejects.toThrow('已注册')
    h.hasRoute.mockReturnValue(true)
    h.tx.rolePermission.count.mockResolvedValue(1)
    await expect(h.service.create(change, actor())).rejects.toThrow('撤销')
    h.tx.rolePermission.count.mockResolvedValue(0)
    const { data } = await h.service.create(change, actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    expect(h.tx.permission.update).toHaveBeenCalledWith({
      where: { id: uuid(30) },
      data: { code: 'system.role.details', method: 'GET', path: '/api/v1/roles/:roleId' },
    })
  })
  it.each(['CUSTOM', 'ALL'])('persists %s scopes with explicit targets and expiry', async (scopeType) => {
    const h = harness()
    h.tx.permission.findFirst.mockResolvedValue({ id: uuid(30) })
    const targets = scopeType === 'CUSTOM' ? [{ targetType: 'USER', targetId: uuid(10) }] : []
    const { data } = await h.service.create(input('ELEVATED_SCOPE', { roleId: uuid(20), scopeType, resource: 'orders', targets }), actor())
    await h.service.transition(data.id, 'approve', { note: 'approve' }, actor(2))
    await h.service.transition(data.id, 'execute', { note: 'execute' }, actor(3))
    expect(h.tx.roleElevatedDataScope.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scopeType,
        resource: 'orders',
        approvalRef: data.id,
        expiresAt: data.expiresAt,
        targets: {
          create: targets.map((target) => ({ ...target, targetUserId: target.targetId })),
        },
      }),
      include: { targets: true },
    })
  })
  it('rejects nonexistent scope targets', async () => {
    const h = harness()
    h.tx.permission.findFirst.mockResolvedValue({ id: uuid(30) })
    h.tx.tenant.findFirst.mockResolvedValue(null)
    await expect(
      h.service.create(
        input('ELEVATED_SCOPE', {
          roleId: uuid(20),
          scopeType: 'CUSTOM',
          resource: 'orders',
          targets: [{ targetType: 'TENANT', targetId: uuid(50) }],
        }),
        actor()
      )
    ).rejects.toThrow('目标不存在')
  })
  it('uses a unique permission code for each exact route', () => {
    const methods = ['create', 'list', 'detail', 'approve', 'execute', 'review'] as const
    expect(methods.map((method) => Reflect.getMetadata(REQUIRED_PERMISSIONS, ApprovalController.prototype[method]))).toEqual([
      ['system.approval.create'],
      ['system.approval.read'],
      ['system.approval.detail'],
      ['system.approval.approve'],
      ['system.approval.execute'],
      ['system.approval.review'],
    ])
  })
})
