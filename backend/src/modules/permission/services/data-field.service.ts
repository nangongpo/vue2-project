import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { FieldRiskLevel, PermissionType, Prisma, PermissionStatus, RoleType } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../../../database/prisma.service.js'
import { ok } from '../policies/policy.js'

type FieldMutationContext = {
  user: { internalId: bigint; userId: string; roles?: unknown[] }
  traceId?: string
  method: string
  url: string
  ip?: string
  riskLevel?: 'L0' | 'L1' | 'L2' | 'L3'
}

@Injectable()
export class DataFieldService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    input: {
      resource: string
      field: string
      name: string
      dataType: string
      riskLevel: FieldRiskLevel
      writable?: boolean
    },
    req: FieldMutationContext
  ) {
    const resource = input.resource?.trim()
    const field = input.field?.trim()
    const name = input.name?.trim()
    if (!resource || !/^[a-z][a-z0-9_.:-]{0,127}$/.test(resource))
      throw new BadRequestException('资源标识无效')
    if (!field || !/^[a-z][a-zA-Z0-9_]{0,127}$/.test(field))
      throw new BadRequestException('字段名无效')
    if (!name || name.length > 128) throw new BadRequestException('字段名称无效')
    const allowedTypes = ['string', 'number', 'boolean', 'enum', 'datetime', 'array', 'object', 'secret']
    if (!allowedTypes.includes(input.dataType)) throw new BadRequestException('字段数据类型无效')
    if (!Object.values(FieldRiskLevel).includes(input.riskLevel))
      throw new BadRequestException('字段风险等级无效')
    const readCode = `${resource}.field.${field}.read`
    const writeCode = input.writable ? `${resource}.field.${field}.write` : null
    return this.prisma.$transaction(
      async (tx) => {
        const existing = await tx.permissionField.findUnique({
          where: { resource_field: { resource, field } },
        })
        if (existing) throw new ConflictException('该数据字段已存在')
        const codes = [readCode, ...(writeCode ? [writeCode] : [])]
        if (await tx.permission.count({ where: { code: { in: codes } } }))
          throw new ConflictException('字段权限码已存在')
        const readPermission = await tx.permission.create({
          data: {
            code: readCode,
            name: `${name}查看`,
            resource,
            action: `field.${field}.read`,
            type: PermissionType.FIELD,
            roleTypes: { create: [{ roleType: RoleType.SECURITY }, { roleType: RoleType.SYSTEM }] },
          },
        })
        const writePermission = writeCode
          ? await tx.permission.create({
              data: {
                code: writeCode,
                name: `${name}修改`,
                resource,
                action: `field.${field}.write`,
                type: PermissionType.FIELD,
                roleTypes: { create: [{ roleType: RoleType.SECURITY }, { roleType: RoleType.SYSTEM }] },
              },
            })
          : null
        const after = await tx.permissionField.create({
          data: {
            resource,
            field,
            name,
            dataType: input.dataType,
            riskLevel: input.riskLevel,
            readPermissionId: readPermission.id,
            writePermissionId: writePermission?.id,
          },
          include: {
            readPermission: { select: { code: true } },
            writePermission: { select: { code: true } },
          },
        })
        const roles = await tx.role.findMany({
          where: { code: { in: ['builtin_security', 'builtin_system'] } },
          select: { id: true },
        })
        for (const role of roles) {
          await tx.rolePermission.create({
            data: { roleId: role.id, permissionId: readPermission.id, grantReason: '数据字段新增' },
          })
          if (writePermission)
            await tx.rolePermission.create({
              data: { roleId: role.id, permissionId: writePermission.id, grantReason: '数据字段新增' },
            })
        }
        await tx.auditLog.create({
          data: {
            traceId: req.traceId || randomUUID(),
            actorId: req.user.internalId,
            action: 'permission.field.create',
            riskLevel: req.riskLevel || 'L3',
            resource,
            method: req.method,
            path: req.url.split('?')[0],
            ip: req.ip,
            result: 'SUCCESS',
            statusCode: 201,
            detail: JSON.parse(JSON.stringify({ actorId: req.user.userId, after }, (_, value) =>
              typeof value === 'bigint' ? value.toString() : value)),
          },
        })
        return ok(after)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  async list(resource?: string) {
    return ok(
      await this.prisma.permissionField.findMany({
        where: resource ? { resource } : undefined,
        orderBy: [{ resource: 'asc' }, { field: 'asc' }],
        select: {
          id: true,
          resource: true,
          field: true,
          name: true,
          dataType: true,
          relationResource: true,
          relationModel: true,
          riskLevel: true,
          status: true,
          readPermission: { select: { code: true } },
          writePermission: { select: { code: true } },
        },
      })
    )
  }

  async status(id: string, status: PermissionStatus, req: FieldMutationContext) {
    if (!Object.values(PermissionStatus).includes(status))
      throw new BadRequestException('字段状态无效')
    return await this.prisma.$transaction(
      async (tx) => {
        const before = await tx.permissionField.findUnique({ where: { id } })
        if (!before) throw new NotFoundException('数据字段不存在')
        const after = await tx.permissionField.update({ where: { id }, data: { status } })
        await tx.auditLog.create({
          data: {
            traceId: req.traceId || randomUUID(),
            actorId: req.user.internalId,
            action: 'permission.field.status',
            riskLevel: req.riskLevel || 'L3',
            resource: before.resource,
            method: req.method,
            path: req.url.split('?')[0],
            ip: req.ip,
            result: 'SUCCESS',
            statusCode: 200,
            detail: JSON.parse(
              JSON.stringify({ actorId: req.user.userId, before, after }, (_, value) =>
                typeof value === 'bigint' ? value.toString() : value
              )
            ),
          },
        })
        return ok(after)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  async update(
    id: string,
    input: { name: string; dataType: string; riskLevel: FieldRiskLevel },
    req: FieldMutationContext
  ) {
    if (!input.name?.trim() || input.name.length > 128)
      throw new BadRequestException('字段名称无效')
    const allowedTypes = [
      'string',
      'number',
      'boolean',
      'enum',
      'datetime',
      'array',
      'object',
      'secret',
    ]
    if (!allowedTypes.includes(input.dataType)) throw new BadRequestException('字段数据类型无效')
    if (!Object.values(FieldRiskLevel).includes(input.riskLevel))
      throw new BadRequestException('字段风险等级无效')
    return this.prisma.$transaction(
      async (tx) => {
        const before = await tx.permissionField.findUnique({ where: { id } })
        if (!before) throw new NotFoundException('数据字段不存在')
        const after = await tx.permissionField.update({
          where: { id },
          data: { name: input.name.trim(), dataType: input.dataType, riskLevel: input.riskLevel },
        })
        await tx.auditLog.create({
          data: {
            traceId: req.traceId || randomUUID(),
            actorId: req.user.internalId,
            action: 'permission.field.update',
            riskLevel: req.riskLevel || 'L3',
            resource: before.resource,
            method: req.method,
            path: req.url.split('?')[0],
            ip: req.ip,
            result: 'SUCCESS',
            statusCode: 200,
            detail: JSON.parse(
              JSON.stringify({ actorId: req.user.userId, before, after }, (_, value) =>
                typeof value === 'bigint' ? value.toString() : value
              )
            ),
          },
        })
        return ok(after)
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }
}
