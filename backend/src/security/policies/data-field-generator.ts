import { Prisma, PrismaClient } from '@prisma/client'
import type { DataFieldDefinition } from './static-field-definitions.js'
import { DATA_FIELD_OVERRIDES, MODEL_RESOURCE_MAP } from './data-field-overrides.js'

type DmmfField = {
  name: string
  type: string
  kind: string
  isList: boolean
}

export type DataFieldOverride = Partial<
  Pick<
    DataFieldDefinition,
    | 'name'
    | 'dataType'
    | 'riskLevel'
    | 'writable'
    | 'relationResource'
    | 'relationModel'
    | 'relationField'
  >
> & {
  status?: 'ACTIVE' | 'DISABLED'
}

const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'mfaSecret',
  'secret',
  'secretKey',
  'accessToken',
  'refreshToken',
])

function kebabCase(value: string) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
}

function resourceForModel(modelName: string) {
  return MODEL_RESOURCE_MAP[modelName] || `system.${kebabCase(modelName)}`
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
  return 'string'
}

function defaultRisk(field: DmmfField) {
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

  return model.fields.map((field) => {
    const override = DATA_FIELD_OVERRIDES[`${resource}.${field.name}`] || {}
    const sensitive = SENSITIVE_FIELDS.has(field.name)
    return {
      resource,
      field: field.name,
      name: override.name || field.name,
      dataType: override.dataType || inferDataType(field),
      ...(field.kind === 'object'
        ? {
            relationModel: override.relationModel || field.type,
            relationResource: override.relationResource || resourceForModel(field.type),
            ...(override.relationField ? { relationField: override.relationField } : {}),
          }
        : {}),
      riskLevel: override.riskLevel || defaultRisk(field),
      ...(override.writable ? { writable: true } : {}),
      ...({ status: override.status || (sensitive ? 'DISABLED' : 'ACTIVE') } as const),
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
      const readCode = `${field.resource}.field.${field.field}.read`
      const writeCode = `${field.resource}.field.${field.field}.write`
      const readPermission = await tx.permission.upsert({
        where: { code: readCode },
        create: {
          code: readCode,
          name: `${field.name}查看`,
          resource: field.resource,
          action: `field.${field.field}.read`,
          type: 'FIELD',
          requiredRoleType: 'SECURITY',
        },
        update: {
          name: `${field.name}查看`,
          resource: field.resource,
          action: `field.${field.field}.read`,
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
              requiredRoleType: 'SECURITY',
            },
            update: {
              name: `${field.name}修改`,
              resource: field.resource,
              action: `field.${field.field}.write`,
            },
          })
        : null
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
          status: field.status || 'ACTIVE',
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
        where: { code: { in: ['builtin_security', 'builtin_system'] } },
        select: { id: true },
      })
      for (const role of roles) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: readPermission.id } },
          create: {
            roleId: role.id,
            permissionId: readPermission.id,
            grantReason: '字段权限自动生成',
          },
          update: {},
        })
        if (writePermission) {
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
      results.push(permissionField)
    }
    return results
  })
}
