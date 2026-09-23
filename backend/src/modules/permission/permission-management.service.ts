import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { PermissionType, Prisma } from '@prisma/client'
import { API_CODE } from '../../common/api-code.js'
import { PrismaService } from '../../database/prisma.service.js'

@Injectable()
export class PermissionManagementService {
  constructor(private readonly prisma: PrismaService) {}

  async listFunctions() {
    const items = await this.prisma.systemFunction.findMany({
      orderBy: [{ parentId: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }],
      include: {
        permission: { select: { id: true, code: true, name: true, type: true } },
        buttons: {
          orderBy: [{ sort: 'asc' }, { createdAt: 'asc' }],
          include: {
            permission: { select: { id: true, code: true, name: true, type: true } },
            apis: { include: { api: { select: { id: true, code: true, name: true, method: true, path: true } } } },
          },
        },
        apis: { include: { api: { select: { id: true, code: true, name: true, method: true, path: true } } } },
      },
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: items }
  }

  async listApis() {
    const items = await this.prisma.permission.findMany({
      where: { type: PermissionType.API },
      orderBy: [{ resource: 'asc' }, { method: 'asc' }, { path: 'asc' }],
      select: { id: true, code: true, name: true, resource: true, action: true, type: true, method: true, path: true },
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: items }
  }

  async createApi(input: { code: string; name: string; method: string; path: string }) {
    try {
      const item = await this.prisma.permission.create({ data: { code: input.code, name: input.name, resource: input.path, action: input.code, type: PermissionType.API, method: input.method, path: input.path } })
      return { code: API_CODE.SUCCESS, message: 'success', data: item }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('接口编码已存在')
      throw error
    }
  }

  async createFunction(input: { code: string; name: string; route: string; component?: string; parentId?: string; sort?: number; apiIds?: string[] }) {
    try {
      const result = await this.prisma.$transaction(async tx => {
        const permission = await tx.permission.create({ data: { code: input.code, name: input.name, resource: input.route, action: input.code, type: PermissionType.PAGE } })
        const item = await tx.systemFunction.create({ data: { code: input.code, name: input.name, route: input.route, component: input.component, parentId: input.parentId, sort: input.sort || 0, permissionId: permission.id } })
        await this.connectApis(tx, item.id, input.apiIds || [])
        return item
      })
      return { code: API_CODE.SUCCESS, message: 'success', data: result }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('功能编码已存在')
      throw error
    }
  }

  async createButton(input: { functionId: string; code: string; name: string; label: string; sort?: number; apiIds?: string[] }) {
    const parent = await this.prisma.systemFunction.findUnique({ where: { id: input.functionId }, select: { id: true, code: true } })
    if (!parent) throw new NotFoundException('所属功能不存在')
    try {
      const result = await this.prisma.$transaction(async tx => {
        const permission = await tx.permission.create({ data: { code: input.code, name: input.name, resource: parent.code, action: input.code, type: PermissionType.BUTTON } })
        const item = await tx.functionButton.create({ data: { functionId: input.functionId, code: input.code, name: input.name, label: input.label, sort: input.sort || 0, permissionId: permission.id } })
        await this.connectButtonApis(tx, item.id, input.apiIds || [])
        return item
      })
      return { code: API_CODE.SUCCESS, message: 'success', data: result }
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') throw new ConflictException('按钮编码已存在')
      throw error
    }
  }

  async mapFunctionApis(functionId: string, apiIds: string[]) {
    const exists = await this.prisma.systemFunction.findUnique({ where: { id: functionId }, select: { id: true } })
    if (!exists) throw new NotFoundException('功能不存在')
    await this.prisma.$transaction(async tx => {
      await tx.functionApi.deleteMany({ where: { functionId } })
      await this.connectApis(tx, functionId, apiIds)
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  async mapButtonApis(buttonId: string, apiIds: string[]) {
    const exists = await this.prisma.functionButton.findUnique({ where: { id: buttonId }, select: { id: true } })
    if (!exists) throw new NotFoundException('按钮不存在')
    await this.prisma.$transaction(async tx => {
      await tx.buttonApi.deleteMany({ where: { buttonId } })
      await this.connectButtonApis(tx, buttonId, apiIds)
    })
    return { code: API_CODE.SUCCESS, message: 'success', data: null }
  }

  private async connectApis(tx: Prisma.TransactionClient, functionId: string, apiIds: string[]) {
    if (!apiIds.length) return
    await this.assertApiIds(tx, apiIds)
    await tx.functionApi.createMany({ data: [...new Set(apiIds)].map(apiId => ({ functionId, apiId })) })
  }

  private async connectButtonApis(tx: Prisma.TransactionClient, buttonId: string, apiIds: string[]) {
    if (!apiIds.length) return
    await this.assertApiIds(tx, apiIds)
    await tx.buttonApi.createMany({ data: [...new Set(apiIds)].map(apiId => ({ buttonId, apiId })) })
  }

  private async assertApiIds(tx: Prisma.TransactionClient, apiIds: string[]) {
    const count = await tx.permission.count({ where: { id: { in: [...new Set(apiIds)] }, type: PermissionType.API } })
    if (count !== new Set(apiIds).size) throw new NotFoundException('存在无效的接口权限')
  }
}
