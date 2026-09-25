import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { normalizePagination, paginationData } from '../../../common/pagination.js'
import { assertAcyclic, assertApi, canonicalPath, ok, RETIRED_CODES } from '../policies/policy.js'
import { riskLevelForOperation } from '../../../security/policies/risk-policy.js'

export type MutationContext = {
  user: { internalId: bigint; userId: string; roles?: unknown[] }
  traceId?: string
  method: string
  url: string
  ip?: string
}
type PageInput = {
  name?: string
  route?: string
  component?: string
  parentId?: string | null
  sort?: number
}
type ButtonInput = { name?: string; label?: string; sort?: number }
const apiSelect = {
  id: true,
  code: true,
  name: true,
  resource: true,
  action: true,
  method: true,
  path: true,
  status: true,
  type: true,
} as const

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}
  async listFunctions() {
    return ok(
      await this.prisma.systemFunction.findMany({
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        include: {
          permission: { select: { id: true, code: true } },
          apis: { include: { api: { select: apiSelect } } },
          buttons: {
            orderBy: { sort: 'asc' },
            include: {
              permission: { select: { id: true, code: true } },
              apis: { include: { api: { select: apiSelect } } },
            },
          },
        },
      })
    )
  }
  async listButtons(functionId: string) {
    const page = await this.prisma.systemFunction.findUnique({
      where: { id: functionId },
      select: { id: true },
    })
    if (!page) throw new NotFoundException('页面不存在')
    return ok(
      await this.prisma.functionButton.findMany({
        where: { functionId },
        orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
        include: {
          permission: { select: { id: true, code: true, status: true } },
          apis: { include: { api: { select: apiSelect } } },
        },
      })
    )
  }
  async listFunctionApis(functionId: string) {
    const page = await this.prisma.systemFunction.findUnique({
      where: { id: functionId },
      select: { id: true },
    })
    if (!page) throw new NotFoundException('页面不存在')
    return ok(
      await this.prisma.functionApi.findMany({
        where: { functionId },
        include: { api: { select: apiSelect } },
      })
    )
  }
  async listApis(
    query: {
      keyword?: string
      method?: string
      status?: 'ACTIVE' | 'DISABLED'
      page?: number
      pageSize?: number
    } = {}
  ) {
    const { page, pageSize } = normalizePagination(query)
    const where: Prisma.PermissionWhereInput = {
      type: 'API',
      code: { notIn: RETIRED_CODES },
      ...(query.method ? { method: query.method } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.keyword
        ? {
            OR: ['name', 'code', 'path'].map((field) => ({ [field]: { contains: query.keyword } })),
          }
        : {}),
    }
    const [total, items] = await this.prisma.$transaction([
      this.prisma.permission.count({ where }),
      this.prisma.permission.findMany({
        where,
        orderBy: [{ resource: 'asc' }, { code: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          ...apiSelect,
          _count: { select: { functionApis: true, buttonApis: true, roles: true } },
        },
      }),
    ])
    return ok(paginationData(items, total, { page, pageSize }))
  }
  async apiOptions() {
    return ok(
      await this.prisma.permission.findMany({
        where: { type: 'API', status: 'ACTIVE', code: { notIn: RETIRED_CODES } },
        orderBy: { code: 'asc' },
        select: apiSelect,
      })
    )
  }
  async createApi(
    input: {
      code: string
      name: string
      method: string
      path: string
      resource: string
      action: string
    },
    req: MutationContext
  ) {
    const path = assertApi(input)
    if (/^(system\.|page\.system\.)/.test(input.code) || /^\/api\/v1\/(permission|roles|users|audit-logs|auth)(\/|$)/.test(path))
      throw new BadRequestException('受保护的管理接口由服务端目录维护')
    return this.change(req, 'api.create', async (tx) => ({
      before: null,
      after: await tx.permission.create({
        data: { ...input, path, type: 'API', requiredRoleType: 'BUSINESS' },
      }),
    }))
  }
  async updateApi(id: string, input: { name?: string; resource?: string; action?: string }, req: MutationContext) {
    return this.change(req, 'api.update', async (tx) => {
      const before = await this.api(tx, id)
      if ((input.resource && input.resource !== before.resource) || (input.action && input.action !== before.action))
        throw new BadRequestException('资源和动作属于安全策略，不能通过普通编辑修改')
      return {
        before,
        after: await tx.permission.update({ where: { id }, data: { name: input.name } }),
      }
    })
  }
  async createFunction(input: PageInput & { code: string; name: string; route: string; apiIds?: string[] }, req: MutationContext) {
    const route = canonicalPath(input.route)
    return this.change(req, 'page.create', async (tx) => {
      if (input.parentId) await this.page(tx, input.parentId, true)
      const permission = await tx.permission.create({
        data: { code: input.code, name: input.name, resource: route, action: 'view', type: 'PAGE' },
      })
      const after = await tx.systemFunction.create({
        data: {
          code: input.code,
          name: input.name,
          route,
          component: input.component,
          parentId: input.parentId || null,
          sort: input.sort || 0,
          permissionId: permission.id,
        },
      })
      await this.bind(tx, 'page', after.id, input.apiIds || [])
      return { before: null, after: { ...after, apiIds: input.apiIds || [] } }
    })
  }
  async updateFunction(id: string, input: PageInput, req: MutationContext) {
    return this.change(req, 'page.update', async (tx) => {
      const before = await this.page(tx, id)
      if (input.parentId !== undefined) {
        if (input.parentId) await this.page(tx, input.parentId, true)
        assertAcyclic(id, input.parentId, await tx.systemFunction.findMany({ select: { id: true, parentId: true } }))
      }
      const after = await tx.systemFunction.update({
        where: { id },
        data: { ...input, ...(input.route ? { route: canonicalPath(input.route) } : {}) },
      })
      if (input.name && before.permissionId)
        await tx.permission.update({
          where: { id: before.permissionId },
          data: { name: input.name },
        })
      return { before, after }
    })
  }
  async createButton(
    input: ButtonInput & {
      functionId: string
      code: string
      name: string
      label: string
      apiIds?: string[]
    },
    req: MutationContext
  ) {
    return this.change(req, 'button.create', async (tx) => {
      const parent = await this.page(tx, input.functionId, true)
      const permission = await tx.permission.create({
        data: {
          code: input.code,
          name: input.name,
          resource: parent.code,
          action: 'operate',
          type: 'BUTTON',
        },
      })
      const after = await tx.functionButton.create({
        data: {
          functionId: input.functionId,
          code: input.code,
          name: input.name,
          label: input.label,
          sort: input.sort || 0,
          permissionId: permission.id,
        },
      })
      await this.bind(tx, 'button', after.id, input.apiIds || [])
      return { before: null, after: { ...after, apiIds: input.apiIds || [] } }
    })
  }
  async updateButton(id: string, input: ButtonInput, req: MutationContext) {
    return this.change(req, 'button.update', async (tx) => {
      const before = await tx.functionButton.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('按钮不存在')
      const after = await tx.functionButton.update({ where: { id }, data: input })
      if (input.name && before.permissionId)
        await tx.permission.update({
          where: { id: before.permissionId },
          data: { name: input.name },
        })
      return { before, after }
    })
  }
  async setStatus(kind: 'api' | 'page' | 'button', id: string, status: 'ACTIVE' | 'DISABLED', req: MutationContext) {
    return this.change(req, `${kind}.status`, async (tx) => {
      if (kind === 'api') {
        const before = await this.api(tx, id)
        const after = await tx.permission.update({ where: { id }, data: { status } })
        if (status === 'DISABLED') await this.revokeRolePermissions(tx, id, req.user.userId, `${kind} 已停用，自动撤销角色授权`)
        return { before, after }
      }
      const before = kind === 'page' ? await this.page(tx, id) : await tx.functionButton.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('资源不存在')
      const after =
        kind === 'page'
          ? await tx.systemFunction.update({ where: { id }, data: { status } })
          : await tx.functionButton.update({ where: { id }, data: { status } })
      if (before.permissionId) {
        await tx.permission.update({ where: { id: before.permissionId }, data: { status } })
        if (status === 'DISABLED')
          await this.revokeRolePermissions(tx, before.permissionId, req.user.userId, `${kind} 已停用，自动撤销角色授权`)
      }
      return { before, after }
    })
  }
  async references(id: string) {
    await this.api(this.prisma, id)
    const [pages, buttons, roles] = await Promise.all([
      this.prisma.functionApi.findMany({
        where: { apiId: id },
        select: { function: { select: { id: true, name: true } } },
      }),
      this.prisma.buttonApi.findMany({
        where: { apiId: id },
        select: { button: { select: { id: true, name: true } } },
      }),
      this.prisma.rolePermission.findMany({
        where: { permissionId: id },
        select: { role: { select: { roleId: true, name: true } } },
      }),
    ])
    return ok({
      functions: pages.map((row) => row.function),
      buttons: buttons.map((row) => row.button),
      roles: roles.map((row) => row.role),
    })
  }
  async deleteApi(id: string, req: MutationContext) {
    return this.change(req, 'api.delete', async (tx) => {
      const before = await this.api(tx, id)
      const counts = await Promise.all([
        tx.functionApi.count({ where: { apiId: id } }),
        tx.buttonApi.count({ where: { apiId: id } }),
        tx.rolePermission.count({ where: { permissionId: id } }),
      ])
      if (counts.some(Boolean)) throw new ConflictException('接口仍被页面、按钮或角色引用，请查看引用关系；建议禁用')
      await tx.permission.delete({ where: { id } })
      return { before, after: null }
    })
  }
  mapFunctionApis(id: string, apiIds: string[], req: MutationContext) {
    return this.mapApis('page', id, apiIds, req)
  }
  mapButtonApis(id: string, apiIds: string[], req: MutationContext) {
    return this.mapApis('button', id, apiIds, req)
  }
  private async mapApis(kind: 'page' | 'button', id: string, apiIds: string[], req: MutationContext) {
    return this.change(req, `${kind}.bind-api`, async (tx) => {
      if (kind === 'page') await this.page(tx, id, true)
      else {
        const button = await tx.functionButton.findUnique({ where: { id } })
        if (!button || button.status !== 'ACTIVE') throw new NotFoundException('按钮不存在或已停用')
        await this.page(tx, button.functionId, true)
      }
      const before =
        kind === 'page'
          ? await tx.functionApi.findMany({ where: { functionId: id } })
          : await tx.buttonApi.findMany({ where: { buttonId: id } })
      await this.bind(tx, kind, id, apiIds)
      return { before, after: { id, apiIds } }
    })
  }
  private async bind(tx: Prisma.TransactionClient, kind: 'page' | 'button', id: string, apiIds: string[]) {
    const ids = [...new Set(apiIds)]
    const apis = await tx.permission.findMany({
      where: { id: { in: ids }, type: 'API', status: 'ACTIVE', code: { notIn: RETIRED_CODES } },
    })
    if (apis.length !== ids.length) throw new BadRequestException('只能绑定有效且启用的接口')
    if (
      kind === 'page' &&
      apis.some((api) => api.method !== 'GET' || !['read', 'list', 'detail', 'init', 'options', 'references'].includes(api.action))
    )
      throw new BadRequestException('页面基础接口只能绑定查询接口，写入、导出与审批必须绑定按钮')
    if (kind === 'page') {
      await tx.functionApi.deleteMany({ where: { functionId: id } })
      if (ids.length) await tx.functionApi.createMany({ data: ids.map((apiId) => ({ functionId: id, apiId })) })
    } else {
      await tx.buttonApi.deleteMany({ where: { buttonId: id } })
      if (ids.length) await tx.buttonApi.createMany({ data: ids.map((apiId) => ({ buttonId: id, apiId })) })
    }
  }
  private async revokeRolePermissions(tx: Prisma.TransactionClient, permissionId: string, actorId: string, reason: string) {
    await tx.rolePermission.updateMany({
      where: { permissionId, revokedAt: null },
      data: { revokedAt: new Date(), revokedBy: actorId, revokeReason: reason },
    })
  }
  private async api(tx: Prisma.TransactionClient, id: string) {
    const item = await tx.permission.findUnique({ where: { id } })
    if (!item || item.type !== 'API' || RETIRED_CODES.includes(item.code)) throw new NotFoundException('接口不存在')
    return item
  }
  private async page(tx: Prisma.TransactionClient, id: string, active = false) {
    const item = await tx.systemFunction.findUnique({ where: { id } })
    if (!item || (active && item.status !== 'ACTIVE')) throw new NotFoundException('页面不存在或已停用')
    return item
  }
  private async change(
    req: MutationContext,
    action: string,
    fn: (tx: Prisma.TransactionClient) => Promise<{ before: unknown; after: unknown }>
  ) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const { before, after } = await fn(tx)
          await tx.auditLog.create({
            data: {
              traceId: req.traceId || randomUUID(),
              actorId: req.user.internalId,
              action,
              riskLevel: riskLevelForOperation(action),
              resource: 'permission',
              method: req.method,
              path: req.url.split('?')[0],
              ip: req.ip,
              result: 'SUCCESS',
              statusCode: req.method === 'POST' ? 201 : req.method === 'DELETE' ? 204 : 200,
              detail: JSON.parse(
                JSON.stringify({ actorId: req.user.userId, roles: req.user.roles, before, after }, (_, value) =>
                  typeof value === 'bigint' ? value.toString() : value
                )
              ),
            },
          })
          return ok(after)
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      )
    } catch (error) {
      const code = (error as { code?: string }).code
      if (code === 'P2002') throw new ConflictException('权限码、路由或接口方法与路径已存在')
      if (code === 'P2003') throw new ConflictException('资源存在引用，不能删除')
      if (code === 'P2034') throw new ConflictException('资源已被并发修改，请刷新后重试')
      throw error
    }
  }
}
