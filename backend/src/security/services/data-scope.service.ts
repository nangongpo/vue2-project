import { ForbiddenException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service.js'
import type { AuthenticatedUser } from '../types/auth.types.js'

export type ScopeActor = Pick<AuthenticatedUser, 'internalId'>
export type DataScopeWhere = {
  AND?: DataScopeWhere[]
  OR?: DataScopeWhere[]
  tenantId?: string
  ownerId?: string
  departmentId?: string | { in: string[] }
  organizationId?: string | { in: string[] }
}
export const effectiveGrant = (now: Date) => ({
  revokedAt: null,
  OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
})
const deny = (): never => {
  throw new ForbiddenException('没有有效的数据范围或归属关系')
}

/** Business repositories only. Management resources require their own semantics. */
@Injectable()
export class DataScopeService {
  constructor(private readonly prisma: PrismaService) {}

  async where(actor: ScopeActor, resource: string, db: Prisma.TransactionClient = this.prisma): Promise<DataScopeWhere> {
    if (!actor?.internalId || !/^[a-z][a-z0-9_.:-]{0,127}$/.test(resource)) return deny()
    const now = new Date()
    const user = await db.user.findUnique({
      where: { id: actor.internalId },
      include: {
        tenant: true,
        roles: {
          where: { ...effectiveGrant(now), role: { status: 'ACTIVE' } },
          include: {
            role: {
              include: {
                dataScopes: { where: { resource, ...effectiveGrant(now) } },
                elevatedDataScopes: {
                  where: {
                    resource,
                    revokedAt: null,
                    validFrom: { lte: now },
                    expiresAt: { gt: now },
                  },
                  include: { targets: true },
                },
              },
            },
          },
        },
      },
    })
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      (user.expiresAt && user.expiresAt <= now) ||
      !user.tenantId ||
      user.tenant?.status !== 'ACTIVE' ||
      !user.roles.length
    )
      return deny()
    const tenantId = user.tenantId
    const clauses: DataScopeWhere[] = [{ tenantId }]
    for (const { role } of user.roles) {
      if (!role.dataScopes.length && !role.elevatedDataScopes.length) return deny()
      for (const scope of role.dataScopes) {
        switch (scope.scopeType) {
          case 'SELF':
            clauses.push({ ownerId: user.userId })
            break
          case 'TENANT':
            break
          case 'DEPARTMENT_SELF':
          case 'DEPARTMENT_TREE': {
            if (!user.departmentId || !user.organizationId) return deny()
            const department = await db.department.findFirst({
              where: {
                id: user.departmentId,
                tenantId,
                organizationId: user.organizationId,
                status: 'ACTIVE',
                organization: { status: 'ACTIVE' },
              },
            })
            if (!department) return deny()
            clauses.push({
              departmentId:
                scope.scopeType === 'DEPARTMENT_SELF'
                  ? department.id
                  : {
                      in: await this.descendants(db, 'department', tenantId, department.id, user.organizationId),
                    },
            })
            break
          }
          case 'ORGANIZATION_SELF':
          case 'ORGANIZATION_TREE': {
            if (!user.organizationId) return deny()
            const organization = await db.organization.findFirst({
              where: { id: user.organizationId, tenantId, status: 'ACTIVE' },
            })
            if (!organization) return deny()
            clauses.push({
              organizationId:
                scope.scopeType === 'ORGANIZATION_SELF'
                  ? organization.id
                  : { in: await this.descendants(db, 'organization', tenantId, organization.id) },
            })
            break
          }
          default:
            return deny()
        }
      }
      for (const scope of role.elevatedDataScopes) {
        if (!scope.approvalRef || !scope.reason?.trim() || scope.expiresAt <= scope.validFrom) return deny()
        if (scope.scopeType === 'ALL') {
          // ALL is still bounded by authenticated tenant and every other scope.
          if (scope.targets.length) return deny()
          continue
        }
        if (scope.scopeType !== 'CUSTOM' || !scope.targets.length) return deny()
        const targets: DataScopeWhere[] = []
        for (const target of scope.targets) {
          const id = target.targetId
          switch (target.targetType) {
            case 'USER':
              if (
                !(await db.user.findFirst({
                  where: {
                    userId: id,
                    tenantId,
                    status: 'ACTIVE',
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                  },
                }))
              )
                return deny()
              targets.push({ ownerId: id })
              break
            case 'DEPARTMENT':
              if (
                !(await db.department.findFirst({
                  where: { id, tenantId, status: 'ACTIVE', organization: { status: 'ACTIVE' } },
                }))
              )
                return deny()
              targets.push({ departmentId: id })
              break
            case 'ORGANIZATION':
              if (!(await db.organization.findFirst({ where: { id, tenantId, status: 'ACTIVE' } }))) return deny()
              targets.push({ organizationId: id })
              break
            case 'TENANT':
              if (id !== tenantId) return deny()
              targets.push({ tenantId })
              break
            default:
              return deny()
          }
        }
        clauses.push({ OR: targets })
      }
    }
    return { AND: clauses }
  }

  private async descendants(
    db: Prisma.TransactionClient,
    kind: 'department' | 'organization',
    tenantId: string,
    root: string,
    organizationId?: string
  ) {
    const visited = new Set([root])
    let frontier = [root]
    while (frontier.length) {
      const where = { tenantId, status: 'ACTIVE' as const, parentId: { in: frontier } }
      const children =
        kind === 'department'
          ? await db.department.findMany({
              where: { ...where, organizationId },
              select: { id: true },
            })
          : await db.organization.findMany({ where, select: { id: true } })
      frontier = []
      for (const child of children) {
        if (visited.has(child.id)) return deny() // Corrupt cyclic hierarchies fail closed.
        visited.add(child.id)
        if (visited.size > 10000) return deny()
        frontier.push(child.id)
      }
    }
    return [...visited]
  }

  /** Runs policy loading and the actual operation in the same DB snapshot.
   * The repository supplies a server-owned model adapter; HTTP input never chooses it.
   * Every adapter operation receives the final AND predicate, never a caller override.
   */
  async execute<T>(
    actor: ScopeActor,
    resource: string,
    where: object,
    operation: (tx: Prisma.TransactionClient, args: { where: { AND: object[] } }) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const policy = await this.where(actor, resource, tx)
        return operation(tx, { where: { AND: [policy, where] } })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }
}
