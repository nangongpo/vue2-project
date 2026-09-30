import { Prisma, PrismaClient } from '@prisma/client'
import { RoleType } from '#app/common/types/prisma-enums.js'
import type { DataFieldDefinition, DmmfField } from '#app/security/policies/field-policy-types.js'
import { DATA_FIELD_OVERRIDES, MODEL_RESOURCE_MAP } from '#app/security/policies/data-field-overrides.js'
import { allowedRoleTypesForPermission } from '#app/security/policies/permission-catalog/index.js'

const SENSITIVE_FIELDS = new Set([
  'password',
  'mfaSecret',
  'secret',
  'secretKey',
  'accessToken',
  'refreshToken',
])

function resourceForModel(modelName: string) {
  const resource = MODEL_RESOURCE_MAP[modelName]
  if (!resource) throw new Error(`Prisma 模型未登记数据权限资源：${modelName}`)
  return resource
}

export function inferDataType(field: Pick<DmmfField, 'type' | 'kind' | 'isList'>) {
  if (field.isList) return 'array'
  if (field.kind === 'object') return 'object'
  if (field.kind === 'enum') return 'enum'
  if (field.type === 'DateTime') return 'datetime'
  if (
    field.type === 'Int' ||
    field.type === 'BigInt' ||
    field.type === 'Float' ||
    field.type === 'Decimal'
  )
    return 'number'
  if (field.type === 'Boolean') return 'boolean'
  if (field.type === 'Json') return 'object'
  throw new Error(`Prisma 字段类型未登记：${field.type}`)
}

export function defaultDataFieldRisk(field: DmmfField) {
  if (SENSITIVE_FIELDS.has(field.name)) return 'L3' as const
  if (field.kind === 'object') return 'L2' as const
  if (field.name === 'id' || field.name.endsWith('Id') || field.name.endsWith('At'))
    return 'L1' as const
  if (field.name === 'status' || field.name === 'type' || field.name === 'roleType')
    return 'L2' as const
  return 'L1' as const
}

export function modelFieldDefinitions(modelName: string, resource: string): DataFieldDefinition[] {
  const model = Prisma.dmmf.datamodel.models.find((item) => item.name === modelName)
  if (!model) throw new Error(`Prisma 模型不存在：${modelName}`)
  const expectedResource = MODEL_RESOURCE_MAP[modelName]
  if (!expectedResource) throw new Error(`Prisma 模型未登记数据权限资源：${modelName}`)
  if (resource !== expectedResource) {
    throw new Error(`数据权限资源与 Prisma 模型不匹配：${modelName} -> ${resource}`)
  }

  return model.fields.map((field) => {
    const override = DATA_FIELD_OVERRIDES[`${resource}.${field.name}`]
    const sensitive = SENSITIVE_FIELDS.has(field.name)
    return {
      resource,
      field: field.name,
      name: override?.name ?? field.name,
      dataType: override?.dataType ?? inferDataType(field),
      ...(field.kind === 'object'
        ? {
            relationModel: override?.relationModel ?? field.type,
            relationResource: override?.relationResource ?? resourceForModel(field.type),
            ...(override?.relationField ? { relationField: override.relationField } : {}),
          }
        : {}),
      riskLevel: override?.riskLevel ?? defaultDataFieldRisk(field),
      ...(!sensitive && override?.writable === true ? { writable: true } : {}),
      status: sensitive ? 'DISABLED' : (override?.status ?? 'ACTIVE'),
    }
  })
}

export async function upsertGeneratedDataFields(
  prisma: PrismaClient,
  definitions: ReturnType<typeof modelFieldDefinitions>
) {
  return prisma.$transaction(async (tx) => {
    const results = []
    for (const field of definitions) {
      if (!field.status) throw new Error(`数据字段未声明状态：${field.resource}.${field.field}`)
      const readCode = `${field.resource}.field.${field.field}.read`
      const writeCode = `${field.resource}.field.${field.field}.write`
      const readRoleTypes = allowedRoleTypesForPermission({ code: readCode, type: 'FIELD' }) as readonly RoleType[]
      const writeRoleTypes = allowedRoleTypesForPermission({ code: writeCode, type: 'FIELD' }) as readonly RoleType[]
      const readPermission = await tx.permission.upsert({
        where: { code: readCode },
        create: {
          code: readCode,
          name: `${field.name}查看`,
          resource: field.resource,
          action: `field.${field.field}.read`,
          type: 'FIELD',
          roleTypes: { create: readRoleTypes.map((roleType) => ({ roleType })) },
        },
        update: {
          name: `${field.name}查看`,
          resource: field.resource,
          action: `field.${field.field}.read`,
          roleTypes: {
            deleteMany: {},
            create: readRoleTypes.map((roleType) => ({ roleType })),
          },
        },
      })
      const writePermission = field.writable
        ? await tx.permission.upsert({
            where: { code: writeCode },
            create: {
              code: writeCode,
              name: `${field.name}修改`,
              resource: field.resource,
              action: `field.${field.field}.write`,
              type: 'FIELD',
              roleTypes: { create: writeRoleTypes.map((roleType) => ({ roleType })) },
            },
            update: {
              name: `${field.name}修改`,
              resource: field.resource,
              action: `field.${field.field}.write`,
              roleTypes: {
                deleteMany: {},
                create: writeRoleTypes.map((roleType) => ({ roleType })),
              },
            },
          })
        : null
      if (!writePermission) {
        const staleWritePermission = await tx.permission.findUnique({ where: { code: writeCode } })
        if (staleWritePermission) {
          await tx.permissionField.updateMany({
            where: { writePermissionId: staleWritePermission.id },
            data: { writePermissionId: null },
          })
          await tx.rolePermission.deleteMany({ where: { permissionId: staleWritePermission.id } })
          await tx.permission.delete({ where: { id: staleWritePermission.id } })
        }
      }
      const permissionField = await tx.permissionField.upsert({
        where: { resource_field: { resource: field.resource, field: field.field } },
        create: {
          resource: field.resource,
          field: field.field,
          name: field.name,
          dataType: field.dataType,
          relationResource: field.relationResource,
          relationModel: field.relationModel,
          relationField: field.relationField,
          riskLevel: field.riskLevel,
          status: field.status,
          readPermissionId: readPermission.id,
          writePermissionId: writePermission?.id,
        },
        update: {
          name: field.name,
          dataType: field.dataType,
          relationResource: field.relationResource,
          relationModel: field.relationModel,
          relationField: field.relationField,
          riskLevel: field.riskLevel,
          readPermissionId: readPermission.id,
          writePermissionId: writePermission?.id,
        },
      })
      const roles = await tx.role.findMany({
        where: { roleType: { in: [...new Set([...readRoleTypes, ...writeRoleTypes])] } },
        select: { id: true, roleType: true },
      })
      for (const role of roles) {
        if (readRoleTypes.includes(role.roleType)) {
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: readPermission.id } },
            create: {
              roleId: role.id,
              permissionId: readPermission.id,
              grantReason: '字段权限自动生成',
            },
            update: {},
          })
        }
        if (writePermission && writeRoleTypes.includes(role.roleType)) {
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: writePermission.id } },
            create: {
              roleId: role.id,
              permissionId: writePermission.id,
              grantReason: '字段权限自动生成',
            },
            update: {},
          })
        }
      }
      await tx.rolePermission.deleteMany({
        where: {
          permissionId: { in: [readPermission.id, ...(writePermission ? [writePermission.id] : [])] },
          role: { roleType: { notIn: [...new Set([...readRoleTypes, ...writeRoleTypes])] } },
        },
      })
      results.push(permissionField)
    }
    return results
  })
}
