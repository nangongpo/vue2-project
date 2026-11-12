import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { FieldRiskLevel, PermissionType, PermissionStatus, RoleType, type RiskLevel } from '#app/common/types/prisma-enums.js'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '#app/database/prisma.service.js'
import { ok } from '#app/modules/permission/policies/policy.js'
import { ENABLEMENT_STATUS_LABELS } from '#app/common/constants/enum-labels.js'
import { sanitizeAuditDetail } from '#app/audit/utils/audit-sanitizer.js'
import type { FieldWriteOperation } from '#app/security/policies/field-policy-types.js'

type FieldMutationContext = {
  user: { internalId: bigint; userId: string; tenantId: string; roles?: unknown[] }
  traceId?: string
  method: string
  url: string
  ip?: string
  riskLevel?: RiskLevel
}

function fieldView<T extends { status: PermissionStatus }>(field: T) {
  const { status, ...view } = field
  return {
    ...view,
    statusLabel: ENABLEMENT_STATUS_LABELS[status],
    isActive: status === PermissionStatus.ACTIVE,
  }
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
      readable: boolean
      writeOperations?: readonly FieldWriteOperation[]
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
    const readable = input.readable
    if (input.dataType === 'secret' && readable)
      throw new BadRequestException('敏感字段禁止配置为可读')
    const readCode = `${resource}.field.${field}.read`
    const writeOperations = input.writeOperations?.length ? [...new Set(input.writeOperations)] : []
    const writeCode = writeOperations.length ? `${resource}.field.${field}.write` : null
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
            readable,
            allowCreate: writeOperations.includes('CREATE'),
            allowUpdate: writeOperations.includes('UPDATE'),
            readPermissionId: readPermission.id,
            writePermissionId: writePermission?.id,
          },
          include: {
            readPermission: { select: { code: true } },
            writePermission: { select: { code: true } },
          },
        })
        const roles = await tx.role.findMany({
          // Permissions are global definitions, but role bindings are tenant data.
          // Never grant a newly-created field permission to another tenant.
          where: { tenantId: req.user.tenantId, code: { in: ['builtin_security', 'builtin_system'] } },
          select: { id: true },
        })
        for (const role of roles) {
          if (readable) {
            await tx.rolePermission.create({
              data: { roleId: role.id, permissionId: readPermission.id, grantReason: '数据字段新增' },
            })
          }
          if (writePermission)
            await tx.rolePermission.create({
              data: { roleId: role.id, permissionId: writePermission.id, grantReason: '数据字段新增' },
            })
        }
        await tx.auditLog.create({
          data: {
            tenantId: req.user.tenantId,
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
            detail: sanitizeAuditDetail({ actorId: req.user.userId, after }) as Prisma.InputJsonValue,
          },
        })
        return ok(fieldView(after))
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  async list(resource?: string) {
    const fields = await this.prisma.permissionField.findMany({
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
          readable: true,
          allowCreate: true,
          allowUpdate: true,
          riskLevel: true,
          status: true,
          readPermission: { select: { code: true } },
          writePermission: { select: { code: true } },
        },
      })
    return ok(fields.map(fieldView))
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
            tenantId: req.user.tenantId,
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
            detail: sanitizeAuditDetail({ actorId: req.user.userId, before, after }) as Prisma.InputJsonValue,
          },
        })
        return ok(fieldView(after))
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }

  async update(
    id: string,
    input: {
      name: string
      dataType: string
      riskLevel: FieldRiskLevel
      readable: boolean
      writeOperations?: readonly FieldWriteOperation[]
    },
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
    const readable = input.readable
    if (input.dataType === 'secret' && readable)
      throw new BadRequestException('敏感字段禁止配置为可读')
    return this.prisma.$transaction(
      async (tx) => {
        const before = await tx.permissionField.findUnique({ where: { id } })
        if (!before) throw new NotFoundException('数据字段不存在')
        const writeOperations = input.writeOperations?.length ? [...new Set(input.writeOperations)] : []
        const writeCode = `${before.resource}.field.${before.field}.write`
        let writePermissionId = before.writePermissionId
        if (writeOperations.length && !writePermissionId) {
          const writePermission = await tx.permission.create({
            data: {
              code: writeCode,
              name: `${input.name.trim()}修改`,
              resource: before.resource,
              action: `field.${before.field}.write`,
              type: PermissionType.FIELD,
              roleTypes: { create: [{ roleType: RoleType.SECURITY }, { roleType: RoleType.SYSTEM }] },
            },
          })
          writePermissionId = writePermission.id
        }
        if (!writeOperations.length && writePermissionId) {
          await tx.rolePermission.deleteMany({ where: { permissionId: writePermissionId } })
          await tx.permission.delete({ where: { id: writePermissionId } })
          writePermissionId = null
        }
        const after = await tx.permissionField.update({
          where: { id },
          data: {
            name: input.name.trim(),
            dataType: input.dataType,
            riskLevel: input.riskLevel,
            readable,
            allowCreate: writeOperations.includes('CREATE'),
            allowUpdate: writeOperations.includes('UPDATE'),
            writePermissionId,
          },
        })
        if (!readable) {
          await tx.rolePermission.deleteMany({ where: { permissionId: before.readPermissionId } })
        }
        const roles = await tx.role.findMany({
          where: { tenantId: req.user.tenantId, code: { in: ['builtin_security', 'builtin_system'] } },
          select: { id: true },
        })
        for (const role of roles) {
          if (readable) {
            await tx.rolePermission.upsert({
              where: { roleId_permissionId: { roleId: role.id, permissionId: before.readPermissionId } },
              create: { roleId: role.id, permissionId: before.readPermissionId, grantReason: '数据字段策略更新' },
              update: {},
            })
          } else {
            await tx.rolePermission.deleteMany({
              where: { roleId: role.id, permissionId: before.readPermissionId },
            })
          }
          if (writePermissionId) {
            await tx.rolePermission.upsert({
              where: { roleId_permissionId: { roleId: role.id, permissionId: writePermissionId } },
              create: { roleId: role.id, permissionId: writePermissionId, grantReason: '数据字段策略更新' },
              update: {},
            })
          }
        }
        await tx.auditLog.create({
          data: {
            tenantId: req.user.tenantId,
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
        return ok(fieldView(after))
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    )
  }
}
