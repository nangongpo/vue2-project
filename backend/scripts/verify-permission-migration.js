// Read-only verification of the current database schema.
// This script does not create databases, run migrations, seed data, or change rows.
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try {
  loadEnvFile(resolve(backendRoot, '.env'))
} catch {
  /* Environment may already be provided by CI. */
}

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')

const migrationPath = resolve(backendRoot, 'prisma/migrations/20260930000000_initial_schema/migration.sql')
const migrationSql = readFileSync(migrationPath, 'utf8')
const expected = new Map()

for (const match of migrationSql.matchAll(/CREATE TABLE `([^`]+)` \(\n([\s\S]*?)\n\) DEFAULT CHARACTER SET/g)) {
  const [, tableName, body] = match
  const columns = new Set()
  for (const line of body.split('\n')) {
    const column = line.match(/^\s+`([^`]+)`\s/)
    if (column) columns.add(column[1])
  }
  expected.set(tableName, columns)
}

const db = new PrismaClient()

try {
  const rows = await db.$queryRawUnsafe(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
  `)
  const actual = new Map()
  for (const row of rows) {
    const tableName = row.table_name ?? row.TABLE_NAME
    const columnName = row.column_name ?? row.COLUMN_NAME
    if (!actual.has(tableName)) actual.set(tableName, new Set())
    actual.get(tableName).add(columnName)
  }

  const missingTables = [...expected.keys()].filter((table) => !actual.has(table))
  const missingColumns = []
  for (const [table, columns] of expected) {
    for (const column of columns) {
      if (!actual.get(table)?.has(column)) missingColumns.push(`${table}.${column}`)
    }
  }
  const camelColumns = []
  for (const [table, columns] of actual) {
    for (const column of columns) {
      if (/[A-Z]/.test(column)) camelColumns.push(`${table}.${column}`)
    }
  }
  const missingUpdatedAt = [...expected.entries()]
    .filter(([, columns]) => columns.has('updated_at'))
    .filter(([table]) => !actual.get(table)?.has('updated_at'))
    .map(([table]) => table)

  const primaryKeyRows = await db.$queryRawUnsafe(`
    SELECT DISTINCT table_name
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND constraint_type = 'PRIMARY KEY'
  `)
  const primaryKeyTables = new Set(primaryKeyRows.map((row) => row.table_name ?? row.TABLE_NAME))
  const missingPrimaryKeys = [...expected.keys()].filter((table) => !primaryKeyTables.has(table))

  const failures = [
    ...missingTables.map((item) => `missing table: ${item}`),
    ...missingColumns.map((item) => `missing column: ${item}`),
    ...camelColumns.map((item) => `camel-case column: ${item}`),
    ...missingUpdatedAt.map((item) => `missing updated_at: ${item}`),
    ...missingPrimaryKeys.map((item) => `missing primary key: ${item}`),
  ]

  if (failures.length) {
    console.error('DATABASE INTEGRITY CHECK FAILED')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.log(`PASS: ${expected.size} tables, required columns, snake_case physical names, updated_at fields, and primary keys are intact.`)
  }
} finally {
  await db.$disconnect()
}
