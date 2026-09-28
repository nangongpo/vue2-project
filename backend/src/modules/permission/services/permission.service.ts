import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PageNodeType, PermissionStatus } from '#app/common/types/prisma-enums.js'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '#app/database/prisma.service.js'
import { normalizePagination, paginationData } from '#app/common/pagination.js'
import {
  assertAcyclic,
  assertApi,
  canonicalComponentPath,
  canonicalPagePath,
  ok,
  RETIRED_CODES,
} from '#app/modules/permission/policies/policy.js'
import {
  hasRecentSecurityProof,
  maxRiskLevel,
  resolveRiskDecision,
  securityStepUpException,
  type RiskDecision,
  type RiskLevel,
} from '#app/security/policies/risk-policy.js'
import { ENABLEMENT_STATUS_LABELS } from '#app/common/constants/enum-labels.js'
import {
  isCatalogManagementCode,
  isManagementApiPath,
  isManagementResource,
  SYSTEM_API_CODES,
} from '#app/security/policies/permission-catalog/index.js'
import { OPERATION_ACTION_OPTIONS } from '#app/security/policies/permission-catalog/operation-actions.js'

export type MutationContext = {
  user: {
    internalId: bigint
    userId: string
    roles?: unknown[]
    mfaEnabled?: boolean
    mfaVerifiedAt?: Date | null
    reauthenticatedAt?: Date | null
  }
  traceId?: string
  method: string
  url: string
  ip?: string
  riskLevel?: RiskLevel
  riskDecision?: RiskDecision
}
type PageInput = {
  name?: string
  route?: string
  component?: string
  icon?: string
  routeProps?: Record<string, unknown>
  parentId?: string | null
  sort?: number
}
type ButtonInput = { label?: string; sort?: number }
function nodeCodeFromRoute(route: string) {
  return route
    .replace(/^\/+/, '')
    .replace(/[^a-zA-Z0-9_.:-]+/g, '.')
    .toLowerCase()
}
function nodeCodeFromParentRoute(route: string, parent?: { code: string; route: string } | null) {
  if (!parent) return nodeCodeFromRoute(route)
  const routeSegments = route.split('/').filter(Boolean)
  const parentRouteSegments = parent.route.split('/').filter(Boolean)
  const hasParentPrefix = parentRouteSegments.every((segment, index) => routeSegments[index] === segment)
  const suffix = hasParentPrefix ? routeSegments.slice(parentRouteSegments.length) : routeSegments
  const parentCode = parent.code
    .replace(/^directory\./, '')
    .split('.')
    .filter(Boolean)
  return [...parentCode, ...suffix].join('.').toLowerCase()
}

function routeFromParentRoute(route: string, parent?: { route: string } | null) {
  const normalized = canonicalPagePath(route)
  if (!parent) return normalized
  const parentRoute = canonicalPagePath(parent.route)
  if (normalized === parentRoute || normalized.startsWith(`${parentRoute}/`)) return normalized
  return canonicalPagePath(`${parentRoute}/${normalized.replace(/^\/+/, '')}`)
}
function buttonCodeFromPage(pageCode: string, actionKey: string) {
  if (!/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(actionKey))
    throw new BadRequestException('操作标识必须是小写英文单词，可使用数字和连字符')
  const resourceCode = pageCode.replace(/^page\./, '').replace(/^directory\./, '')
  return `button.${resourceCode}.${actionKey}`
}
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

/** Enablement status is an internal enum; responses expose only safe presentation fields. */
function toApiView(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(toApiView)
  if (!value || typeof value !== 'object') return value
  const object = value as Record<string, unknown>
  const projected = Object.fromEntries(Object.entries(object).map(([key, item]) => [key, toApiView(item)]))
  if (typeof object.status === 'string') {
    const status = object.status as PermissionStatus
    if (status === PermissionStatus.ACTIVE || status === PermissionStatus.DISABLED) {
      delete projected.status
      projected.statusLabel = ENABLEMENT_STATUS_LABELS[status]
      projected.isActive = status === PermissionStatus.ACTIVE
    }
  }
  return projected
}

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}
  async getFunctionRoute(id: string) {
    const page = await this.prisma.systemFunction.findUnique({ where: { id }, select: { route: true } })
    if (!page) throw new NotFoundException('页面不存在')
    return page.route
  }
  async assertPageMetadataSecurity(id: string, req: MutationContext) {
    const page = await this.prisma.systemFunction.findUnique({
      where: { id },
      select: { permission: { select: { roleTypes: { select: { roleType: true } } } } },
    })
    if (!page) throw new NotFoundException('页面不存在')
    const isBusinessPage = page.permission?.roleTypes.some((item) => item.roleType === 'BUSINESS')
    const decision = resolveRiskDecision('system.page.update', { targetRiskLevel: isBusinessPage ? 'L2' : 'L3' })
    req.riskDecision = decision
    req.riskLevel = decision.riskLevel
    if (!hasRecentSecurityProof(req.user, decision.riskLevel)) throw securityStepUpException(req.user, decision)
    return decision.riskLevel
  }
  async pageStatusRisk(id: string): Promise<RiskLevel> {
    const page = await this.prisma.systemFunction.findUnique({
      where: { id },
      select: { nodeType: true, permission: { select: { roleTypes: { select: { roleType: true } } } } },
    })
    if (!page || page.nodeType === PageNodeType.DIRECTORY) throw new BadRequestException('目录节点不能单独停用或启用')
    return resolveRiskDecision('system.page.update', {
      targetRiskLevel: page.permission?.roleTypes.some((item) => item.roleType === 'BUSINESS') ? 'L2' : 'L3',
    }).riskLevel
  }
  async listPageTree() {
    const functions = await this.prisma.systemFunction.findMany({
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        route: true,
        component: true,
        icon: true,
        routeProps: true,
        nodeType: true,
        parentId: true,
        sort: true,
        status: true,
        permission: {
          select: { id: true, code: true, roleTypes: { select: { roleType: true } } },
        },
      },
    })
    return ok(toApiView(functions.map((page) => ({
      ...page,
      permission: page.permission ? { id: page.permission.id, code: page.permission.code } : null,
      isSystemBuiltin: !page.permission?.roleTypes.some((item) => item.roleType === 'BUSINESS'),
    }))))
  }
  async listPageButtons(pageId: string) {
    const page = await this.prisma.systemFunction.findUnique({ where: { id: pageId }, select: { id: true } })
    if (!page) throw new NotFoundException('页面不存在')
    return ok(toApiView(await this.prisma.functionButton.findMany({
      where: { functionId: pageId },
      orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
      include: {
        permission: { select: { id: true, code: true, status: true } },
        apis: { include: { api: { select: apiSelect } } },
      },
    })))
  }
  async listPageBaseApis(pageId: string) {
    const page = await this.prisma.systemFunction.findUnique({ where: { id: pageId }, select: { id: true } })
    if (!page) throw new NotFoundException('页面不存在')
    const bindings = await this.prisma.functionApi.findMany({
      where: { functionId: pageId },
      orderBy: { api: { code: 'asc' } },
      select: { api: { select: apiSelect } },
    })
    return ok(toApiView(bindings.map(({ api }) => api)))
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
    return ok(toApiView(paginationData(items, total, { page, pageSize })))
  }
  async apiOptions() {
    const items = await this.prisma.permission.findMany({
      where: { type: 'API', status: 'ACTIVE', code: { notIn: RETIRED_CODES } },
      orderBy: { code: 'asc' },
      select: apiSelect,
    })
    return ok(
      toApiView(items.map((item) => ({ ...item, isSystemBuiltin: SYSTEM_API_CODES.has(item.code) })))
    )
  }
  operationActionOptions() {
    return ok(OPERATION_ACTION_OPTIONS)
  }
  async pageApiOptions() {
    const items = await this.prisma.permission.findMany({
      where: {
        type: 'API',
        status: 'ACTIVE',
        method: 'GET',
        code: { notIn: RETIRED_CODES },
      },
      orderBy: { code: 'asc' },
      select: apiSelect,
    })
    return ok(
      toApiView(items.map((item) => ({ ...item, isSystemBuiltin: SYSTEM_API_CODES.has(item.code) })))
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
    if (isManagementResource(input.resource) || isCatalogManagementCode(input.code) || isManagementApiPath(input.path))
      throw new BadRequestException('受保护的管理接口由服务端目录维护')
    return this.change(req, 'system.api.create', async (tx) => {
      const after = await tx.permission.create({
        data: {
          ...input,
          path,
          type: 'API',
          roleTypes: { create: { roleType: 'BUSINESS' } },
        },
      })
      return { before: null, after }
    })
  }
  async updateApi(id: string, input: { name?: string; resource?: string; action?: string }, req: MutationContext) {
    return this.change(req, 'system.api.update', async (tx) => {
      const before = await this.api(tx, id)
      if ((input.resource && input.resource !== before.resource) || (input.action && input.action !== before.action))
        throw new BadRequestException('资源和动作属于安全策略，不能通过普通编辑修改')
      return {
        before,
        after: await tx.permission.update({ where: { id }, data: { name: input.name } }),
      }
    })
  }
  async createFunction(
    input: PageInput & { code?: string; name: string; route: string; apiIds?: string[] },
    req: MutationContext
  ) {
    return this.change(req, 'system.page.create', async (tx) => {
      let parent: { code: string; route: string; nodeType: PageNodeType } | null = null
      if (input.parentId) {
        parent = await this.page(tx, input.parentId, true)
        if (parent.nodeType !== PageNodeType.DIRECTORY) throw new BadRequestException('页面只能挂在目录节点下')
      }
      const route = routeFromParentRoute(input.route, parent)
      if (!input.component) throw new BadRequestException('页面必须填写组件路径')
      canonicalComponentPath(input.component)
      const code = `page.${nodeCodeFromParentRoute(route, parent)}`
      const permission = await tx.permission.create({
        data: {
          code,
          name: input.name,
          resource: route,
          action: 'view',
          type: 'PAGE',
          roleTypes: { create: { roleType: 'BUSINESS' } },
        },
      })
      const after = await tx.systemFunction.create({
        data: {
          code,
          name: input.name,
          route,
          component: input.component,
          icon: input.icon || null,
          routeProps: input.routeProps ? (input.routeProps as Prisma.InputJsonValue) : Prisma.JsonNull,
          nodeType: PageNodeType.PAGE,
          parentId: input.parentId || null,
          sort: input.sort || 0,
          permissionId: permission.id,
        },
      })
      await this.bind(tx, 'page', after.id, input.apiIds || [])
      return { before: null, after: { ...after, apiIds: input.apiIds || [] } }
    })
  }
  async createDirectory(
    input: { name: string; route: string; parentId?: string | null; sort?: number; icon?: string },
    req: MutationContext
  ) {
    return this.change(
      req,
      'system.directory.create',
      async (tx) => {
        let parent: { code: string; route: string; nodeType: PageNodeType } | null = null
        if (input.parentId) {
          parent = await this.page(tx, input.parentId, true)
          if (parent.nodeType !== PageNodeType.DIRECTORY) throw new BadRequestException('目录节点只能挂在目录节点下')
        }
        const route = routeFromParentRoute(input.route, parent)
        const code = nodeCodeFromParentRoute(route, parent)
        const after = await tx.systemFunction.create({
          data: {
            code,
            name: input.name,
            route,
            component: null,
            icon: input.icon || null,
            nodeType: PageNodeType.DIRECTORY,
            parentId: input.parentId || null,
            sort: input.sort || 0,
            permissionId: null,
          },
        })
        return { before: null, after }
      },
      '目录路由已存在，请更换目录路由'
    )
  }
  async deleteDirectory(id: string, req: MutationContext) {
    return this.change(req, 'system.directory.delete', async (tx) => {
      const before = await this.page(tx, id)
      if (before.nodeType !== PageNodeType.DIRECTORY) throw new BadRequestException('只能删除目录节点')
      const childCount = await tx.systemFunction.count({ where: { parentId: id } })
      if (childCount > 0) throw new ConflictException('目录包含子节点，不能删除')
      const [apiCount, buttonCount] = await Promise.all([
        tx.functionApi.count({ where: { functionId: id } }),
        tx.functionButton.count({ where: { functionId: id } }),
      ])
      if (apiCount || buttonCount) throw new ConflictException('目录存在绑定资源，不能删除')
      const after = await tx.systemFunction.delete({ where: { id } })
      return { before, after }
    })
  }
  async deleteFunction(id: string, req: MutationContext) {
    return this.change(req, 'system.page.delete', async (tx) => {
      const before = await this.page(tx, id)
      if (before.nodeType === PageNodeType.DIRECTORY) throw new BadRequestException('目录节点请使用目录删除操作')
      const [childCount, apiCount, buttonCount] = await Promise.all([
        tx.systemFunction.count({ where: { parentId: id } }),
        tx.functionApi.count({ where: { functionId: id } }),
        tx.functionButton.count({ where: { functionId: id } }),
      ])
      if (childCount > 0) throw new ConflictException('页面包含子节点，不能删除')
      if (apiCount > 0) throw new ConflictException('页面存在基础接口绑定，不能删除')
      if (buttonCount > 0) throw new ConflictException('页面存在按钮绑定，不能删除')
      if (before.permissionId) {
        const roleCount = await tx.rolePermission.count({ where: { permissionId: before.permissionId } })
        if (roleCount > 0) throw new ConflictException('页面存在角色授权，不能删除')
      }
      const after = await tx.systemFunction.delete({ where: { id } })
      if (before.permissionId) await tx.permission.delete({ where: { id: before.permissionId } })
      return { before, after }
    })
  }
  async updateFunction(id: string, input: PageInput, req: MutationContext) {
    return this.updateFunctionWithAction(id, input, req, 'system.page.update')
  }
  async updateDirectory(id: string, input: PageInput, req: MutationContext) {
    return this.updateFunctionWithAction(id, input, req, 'system.directory.update', PageNodeType.DIRECTORY)
  }
  private async updateFunctionWithAction(
    id: string,
    input: PageInput,
    req: MutationContext,
    action: string,
    expectedNodeType?: PageNodeType
  ) {
    return this.change(req, action, async (tx) => {
      const before = await this.page(tx, id)
      if (expectedNodeType && before.nodeType !== expectedNodeType)
        throw new BadRequestException('节点类型与编辑接口不匹配')
      const nodeType = before.nodeType
      if (nodeType === PageNodeType.DIRECTORY) {
        const [apiCount, buttonCount] = await Promise.all([
          tx.functionApi.count({ where: { functionId: id } }),
          tx.functionButton.count({ where: { functionId: id } }),
        ])
        if (apiCount || buttonCount) throw new ConflictException('目录节点不能包含页面接口或按钮，请先解除绑定')
      }
      let routeParent: { code: string; route: string; nodeType: PageNodeType } | null = null
      const targetParentId = input.parentId !== undefined ? input.parentId : before.parentId
      if (targetParentId) {
        const parent = await this.page(tx, targetParentId, true)
        routeParent = parent
        if (parent.nodeType !== PageNodeType.DIRECTORY) throw new BadRequestException('页面和目录都只能挂在目录节点下')
      }
      if (input.parentId !== undefined) {
        assertAcyclic(id, input.parentId, await tx.systemFunction.findMany({ select: { id: true, parentId: true } }))
      }
      if (nodeType === PageNodeType.DIRECTORY && input.route && !routeParent && before.parentId)
        routeParent = await this.page(tx, before.parentId, true)
      const nextRoute = input.route ? routeFromParentRoute(input.route, routeParent) : undefined
      if (nodeType !== PageNodeType.DIRECTORY && input.component !== undefined) {
        if (!input.component) throw new BadRequestException('页面必须填写组件路径')
        canonicalComponentPath(input.component)
      }
      const after = await tx.systemFunction.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(nextRoute ? { route: nextRoute } : {}),
          ...(nodeType === PageNodeType.DIRECTORY && input.route
            ? { code: nodeCodeFromParentRoute(nextRoute!, routeParent) }
            : {}),
          ...(input.parentId !== undefined ? { parentId: input.parentId } : {}),
          ...(input.sort !== undefined ? { sort: input.sort } : {}),
          ...(input.icon !== undefined ? { icon: input.icon || null } : {}),
          ...(input.routeProps !== undefined
            ? { routeProps: input.routeProps ? (input.routeProps as Prisma.InputJsonValue) : Prisma.JsonNull }
            : {}),
          nodeType,
          ...(nodeType === PageNodeType.DIRECTORY
            ? { component: null, routeProps: Prisma.JsonNull }
            : input.component !== undefined
            ? { component: input.component }
            : {}),
        },
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
      actionKey: string
      label: string
      apiIds?: string[]
    },
    req: MutationContext
  ) {
    return this.change(req, 'system.button.create', async (tx) => {
      const parent = await this.page(tx, input.functionId, true)
      if (parent.nodeType === PageNodeType.DIRECTORY) throw new BadRequestException('目录节点不能配置按钮')
      const code = buttonCodeFromPage(parent.code, input.actionKey)
      const duplicate = await tx.permission.findUnique({ where: { code }, select: { id: true } })
      if (duplicate) throw new ConflictException('该页面下的操作标识已存在，请更换操作标识')
      const permission = await tx.permission.create({
        data: {
          code,
          name: input.label,
          resource: parent.code,
          action: 'operate',
          type: 'BUTTON',
          roleTypes: { create: { roleType: 'BUSINESS' } },
        },
      })
      const after = await tx.functionButton.create({
        data: {
          functionId: input.functionId,
          code,
          name: input.actionKey,
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
    return this.change(req, 'system.button.update', async (tx) => {
      const before = await tx.functionButton.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('按钮不存在')
      const after = await tx.functionButton.update({ where: { id }, data: input })
      if (input.label && before.permissionId)
        await tx.permission.update({
          where: { id: before.permissionId },
          data: { name: input.label },
        })
      return { before, after }
    })
  }
  async setStatus(kind: 'api' | 'page' | 'button', id: string, status: 'ACTIVE' | 'DISABLED', req: MutationContext) {
    const operationCode = `system.${kind}.${status === 'ACTIVE' ? 'enable' : 'disable'}`
    return this.change(req, operationCode, async (tx) => {
      if (kind === 'api') {
        const before = await this.api(tx, id)
        const after = await tx.permission.update({ where: { id }, data: { status } })
        if (status === 'DISABLED')
          await this.revokeRolePermissions(tx, id, req.user.userId, `${kind} 已停用，自动撤销角色授权`)
        return { before, after }
      }
      const before = kind === 'page' ? await this.page(tx, id) : await tx.functionButton.findUnique({ where: { id } })
      if (!before) throw new NotFoundException('资源不存在')
      if (kind === 'page' && 'nodeType' in before && before.nodeType === PageNodeType.DIRECTORY)
        throw new BadRequestException('目录节点不能单独停用或启用，请调整子页面状态')
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
    return this.change(req, 'system.api.delete', async (tx) => {
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
    return this.change(req, kind === 'page' ? 'system.page.api.bind' : 'system.button.api.bind', async (tx) => {
      if (kind === 'page') {
        const page = await this.page(tx, id, true)
        if (page.nodeType === PageNodeType.DIRECTORY) throw new BadRequestException('目录节点不能绑定页面基础接口')
      } else {
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
      apis.some(
        (api) =>
          api.method !== 'GET' || !['read', 'list', 'detail', 'init', 'options', 'references'].includes(api.action)
      )
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
  private async revokeRolePermissions(
    tx: Prisma.TransactionClient,
    permissionId: string,
    actorId: string,
    reason: string
  ) {
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
    fn: (tx: Prisma.TransactionClient) => Promise<{ before: unknown; after: unknown }>,
    conflictMessage = '权限码、路由或接口方法与路径已存在'
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
              riskLevel: maxRiskLevel(resolveRiskDecision(action).riskLevel, req.riskLevel ?? 'L0'),
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
      if (code === 'P2002') throw new ConflictException(conflictMessage)
      if (code === 'P2003') throw new ConflictException('资源存在引用，不能删除')
      if (code === 'P2034') throw new ConflictException('资源已被并发修改，请刷新后重试')
      throw error
    }
  }
}
