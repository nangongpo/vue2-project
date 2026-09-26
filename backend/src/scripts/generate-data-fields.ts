import { PrismaClient } from '@prisma/client'
import {
  modelFieldDefinitions,
  upsertGeneratedDataFields,
} from '../security/policies/data-field-generator.js'

const args = new Map<string, string>()
for (let index = 2; index < process.argv.length; index += 1) {
  const value = process.argv[index]
  if (value.startsWith('--')) args.set(value.slice(2), process.argv[index + 1] || '')
}

const model = args.get('model')
const resource = args.get('resource')
const dryRun = args.has('dry-run')

if (!model || !resource) {
  console.error(
    '用法：pnpm --filter backend permission:fields --model Department --resource system.department [--dry-run]'
  )
  process.exit(1)
}

const definitions = modelFieldDefinitions(model, resource)
console.table(definitions)

if (!dryRun) {
  const prisma = new PrismaClient()
  try {
    const fields = await upsertGeneratedDataFields(prisma, definitions)
    console.log(`已生成 ${fields.length} 个字段权限：${resource}`)
  } finally {
    await prisma.$disconnect()
  }
}
