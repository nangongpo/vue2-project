import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { DATA_FIELD_DEFINITIONS } from '#app/security/policies/static-field-definitions.js'
import { API_BY_CODE } from '#app/security/policies/permission-catalog/index.js'
try { loadEnvFile() } catch { /* Injected environment. */ }
const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')
const grantReaders = process.argv.includes('--grant-existing-readers')
const resources = ['system.file.scan-job', 'system.file.scan-trigger', 'system.file.scan-attempt']
const codes = ['read', 'detail', 'attempts'].map((action) => `system.file.admin.scan-history.${action}`)
try {
  const target = new URL(process.env.DATABASE_URL!)
  if (!['127.0.0.1', 'localhost'].includes(target.hostname)) throw new Error('仅允许本机数据库，部署时须使用受控发布流程')
  const fields = DATA_FIELD_DEFINITIONS.filter((field) => resources.includes(field.resource))
  console.log(JSON.stringify({ database: target.pathname.slice(1), apply, grantReaders, apiCodes: codes, fieldCount: fields.length }))
  const now = new Date()
  const sourceGrants = await prisma.rolePermission.findMany({ where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], role: { status: 'ACTIVE', roleType: { in: ['SECURITY', 'SYSTEM'] } }, permission: { code: { in: ['system.file.admin.detail', 'system.file.field.scanDetail.read'] }, status: 'ACTIVE' } }, include: { permission: { select: { code: true } } } })
  const readers = sourceGrants.filter((grant) => grant.permission.code === 'system.file.admin.detail').flatMap((grant) => {
    const fieldGrant = sourceGrants.find((field) => field.roleId === grant.roleId && field.permission.code === 'system.file.field.scanDetail.read')
    if (!fieldGrant) return []
    const expiries = [grant.expiresAt, fieldGrant.expiresAt].filter((date): date is Date => !!date)
    return [{ roleId: grant.roleId, expiresAt: expiries.length ? new Date(Math.min(...expiries.map((date) => date.getTime()))) : null }]
  })
  console.log(JSON.stringify({ eligibleReaderRoles: readers.length }))
  if (apply) await prisma.$transaction(async (tx) => {
    const ids: string[] = []
    for (const code of codes) {
      const api = API_BY_CODE.get(code)!
      const data = { name: api.name, resource: api.resource, action: api.action, method: api.method, path: api.path, type: 'API' as const }
      const permission = await tx.permission.upsert({ where: { code }, create: { code, ...data, roleTypes: { create: [{ roleType: 'SECURITY' }, { roleType: 'SYSTEM' }] } }, update: data })
      ids.push(permission.id)
      for (const pageCode of ['page.system.file', 'page.system.approval']) {
        const page = await tx.systemFunction.findUnique({ where: { code: pageCode }, select: { id: true } })
        if (page) await tx.functionApi.upsert({ where: { functionId_apiId: { functionId: page.id, apiId: permission.id } }, create: { functionId: page.id, apiId: permission.id, required: false }, update: {} })
      }
    }
    for (const field of fields) {
      const code = `${field.resource}.field.${field.field}.read`
      const permission = await tx.permission.upsert({ where: { code }, create: { code, name: `${field.name}查看`, type: 'FIELD', resource: field.resource, action: `field.${field.field}.read`, roleTypes: { create: [{ roleType: 'SECURITY' }, { roleType: 'SYSTEM' }] } }, update: {} })
      ids.push(permission.id)
      const data = { name: field.name, dataType: field.dataType, riskLevel: field.riskLevel, relationResource: field.relationResource || null, relationModel: field.relationModel || null, readable: true, allowCreate: false, allowUpdate: false, readPermissionId: permission.id }
      await tx.permissionField.upsert({ where: { resource_field: { resource: field.resource, field: field.field } }, create: { resource: field.resource, field: field.field, ...data }, update: data })
    }
    if (grantReaders) for (const reader of readers) for (const permissionId of ids) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: reader.roleId, permissionId } }, create: { ...reader, permissionId, grantReason: '扫描历史上线：沿用已有文件详情与扫描说明读取范围及最短有效期' }, update: {} })
    console.log(JSON.stringify({ activeApis: await tx.permission.count({ where: { code: { in: codes }, status: 'ACTIVE' } }), activeFields: await tx.permissionField.count({ where: { resource: { in: resources }, status: 'ACTIVE' } }) }))
  }, { timeout: 30000 })
} finally { await prisma.$disconnect() }
