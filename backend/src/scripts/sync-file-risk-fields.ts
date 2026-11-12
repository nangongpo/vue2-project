import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { DATA_FIELD_DEFINITIONS } from '#app/security/policies/static-field-definitions.js'
try { loadEnvFile() } catch { /* Environment may be injected. */ }
const db = new PrismaClient()
const apply = process.argv.includes('--apply')
const resources = ['system.file.scan-job', 'system.file.scan-trigger', 'system.file.scan-attempt']
try {
  const target = new URL(process.env.DATABASE_URL!)
  if (!['localhost', '127.0.0.1'].includes(target.hostname)) throw new Error('仅允许本机数据库')
  const fields = DATA_FIELD_DEFINITIONS.filter((field) => resources.includes(field.resource))
  const current = await db.permissionField.findMany({ where: { resource: { in: resources } }, select: { id: true, resource: true, field: true, riskLevel: true } })
  const changes = current.flatMap((row) => {
    const definition = fields.find((field) => field.resource === row.resource && field.field === row.field)
    // L3 is an explicit stricter setting; never lower it with this default migration.
    return definition && row.riskLevel !== definition.riskLevel && row.riskLevel !== 'L3'
      ? [{ ...row, nextRiskLevel: definition.riskLevel }] : []
  })
  console.log(JSON.stringify({ database: target.pathname.slice(1), apply, changes }))
  if (apply) await db.$transaction(async (tx) => {
    for (const change of changes) await tx.permissionField.updateMany({ where: { id: change.id, riskLevel: change.riskLevel }, data: { riskLevel: change.nextRiskLevel } })
  })
} finally { await db.$disconnect() }
