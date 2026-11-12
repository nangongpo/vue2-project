import { loadEnvFile } from 'node:process'
import { PrismaClient, type Prisma } from '@prisma/client'
import { DATA_FIELD_DEFINITIONS, DATA_FIELD_PERMISSIONS } from '#app/security/policies/static-field-definitions.js'

// Only retire obsolete file-response permissions and introduce the translated
// classification field. Does not initialize accounts, roles or data scopes.
try { loadEnvFile() } catch { /* Environment may be injected. */ }
const apply = process.argv.includes('--apply')
const resources = ['system.file', 'system.file.binding', 'system.file.upload', 'system.file.scan-result']
const definitions = DATA_FIELD_DEFINITIONS.filter((field) => resources.includes(field.resource))
const label = definitions.find((field) => field.resource === 'system.file' && field.field === 'classificationLabel')!
const labelCode = 'system.file.field.classificationLabel.read'
const prisma = new PrismaClient()
try {
  const url = new URL(process.env.DATABASE_URL!)
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('只允许连接本机数据库')
  console.log(JSON.stringify({ target: { host: url.hostname, port: url.port, database: url.pathname.slice(1) }, apply }))
  const inspect = async (db: PrismaClient | Prisma.TransactionClient) => {
    const fields = await db.permissionField.findMany({ where: { resource: { in: resources } }, select: { resource: true, field: true, status: true } })
    const permissions = await db.permission.findMany({ where: { resource: { in: resources }, type: 'FIELD' }, select: { code: true, status: true } })
    return {
      obsoleteFields: fields.filter((item) => item.status === 'ACTIVE' && !definitions.some((field) => field.resource === item.resource && field.field === item.field)),
      obsoletePermissions: permissions.filter((item) => item.status === 'ACTIVE' && !DATA_FIELD_PERMISSIONS.some((permission) => permission.code === item.code)),
      label: fields.find((item) => item.resource === label.resource && item.field === label.field) || null,
    }
  }
  console.log(JSON.stringify({ before: await inspect(prisma) }))
  if (apply) {
    await prisma.$transaction(async (tx) => {
      // Grant the translated name only to existing readers of the same data,
      // preserving expiration; never revive revoked grants or modify roles.
      const source = await tx.permission.findUniqueOrThrow({ where: { code: 'system.file.field.classification.read' } })
      const readers = await tx.rolePermission.findMany({ where: {
        permissionId: source.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        role: { status: 'ACTIVE', roleType: { in: ['SECURITY', 'SYSTEM'] } },
      } })
      const permission = await tx.permission.upsert({
        where: { code: labelCode },
        create: { code: labelCode, name: `${label.name}查看`, resource: label.resource, action: `field.${label.field}.read`, type: 'FIELD', roleTypes: { create: [{ roleType: 'SECURITY' }, { roleType: 'SYSTEM' }] } },
        update: {},
      })
      await tx.permissionField.upsert({
        where: { resource_field: { resource: label.resource, field: label.field } },
        create: { resource: label.resource, field: label.field, name: label.name, dataType: label.dataType, riskLevel: label.riskLevel, readable: true, allowCreate: false, allowUpdate: false, readPermissionId: permission.id },
        update: {},
      })
      for (const reader of readers) {
        await tx.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: reader.roleId, permissionId: permission.id } },
          create: { roleId: reader.roleId, permissionId: permission.id, expiresAt: reader.expiresAt, grantedBy: reader.grantedBy, grantReason: '文件分类编码改为中文名称，沿用原字段读取范围' },
          update: {},
        })
      }
      for (const resource of resources) {
        await tx.permissionField.updateMany({ where: { resource, field: { notIn: definitions.filter((field) => field.resource === resource).map((field) => field.field) } }, data: { status: 'DISABLED' } })
        await tx.permission.updateMany({ where: { resource, type: 'FIELD', code: { notIn: DATA_FIELD_PERMISSIONS.filter((field) => field.code.startsWith(`${resource}.field.`)).map((field) => field.code) } }, data: { status: 'DISABLED' } })
      }
      const after = await inspect(tx)
      if (after.obsoleteFields.length || after.obsoletePermissions.length || after.label?.status !== 'ACTIVE') throw new Error('权限同步校验失败，回滚事务')
      console.log(JSON.stringify({ after, inheritedLabelGrants: readers.length }))
    }, { timeout: 15000 })
  }
} finally { await prisma.$disconnect() }
