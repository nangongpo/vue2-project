// Read-only verification of generic database integrity.
// This script does not infer application tables or fields from migration files.
// It does not create databases, run migrations, seed data, or change rows.
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

const db = new PrismaClient()

try {
  const migrationFailures = await db.$queryRawUnsafe(`
    SELECT migration_name, started_at, finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
  `)

  const tablesWithoutPrimaryKey = await db.$queryRawUnsafe(`
    SELECT tables.table_name
    FROM information_schema.tables AS tables
    LEFT JOIN information_schema.table_constraints AS pk
      ON pk.table_schema = tables.table_schema
     AND pk.table_name = tables.table_name
     AND pk.constraint_type = 'PRIMARY KEY'
    WHERE tables.table_schema = DATABASE()
      AND tables.table_type = 'BASE TABLE'
      AND pk.table_name IS NULL
  `)

  const invalidIdentifiers = await db.$queryRawUnsafe(`
    SELECT 'TABLE' AS object_type, table_name, table_name AS object_name
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_type = 'BASE TABLE'
      AND (table_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(table_name) > 64)
    UNION ALL
    SELECT 'COLUMN' AS object_type, table_name, column_name AS object_name
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND (column_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(column_name) > 64)
    UNION ALL
    SELECT 'INDEX' AS object_type, table_name, index_name AS object_name
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND (index_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(index_name) > 64)
  `)

  const invalidForeignKeys = await db.$queryRawUnsafe(`
    SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name
    FROM information_schema.key_column_usage AS kcu
    WHERE table_schema = DATABASE()
      AND referenced_table_name IS NOT NULL
      AND (
        referenced_table_name NOT IN (
          SELECT table_name
          FROM information_schema.tables
          WHERE table_schema = DATABASE()
        )
        OR NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = DATABASE()
            AND table_name = kcu.referenced_table_name
            AND column_name = kcu.referenced_column_name
        )
      )
  `)

  const failures = [
    ...migrationFailures.map((row) => `migration not completed: ${row.migration_name}`),
    ...tablesWithoutPrimaryKey.map((row) => `table without primary key: ${row.table_name}`),
    ...invalidIdentifiers.map((row) => `${row.object_type} has invalid identifier: ${row.table_name}.${row.object_name}`),
    ...invalidForeignKeys.map((row) => `invalid foreign key: ${row.table_name}.${row.column_name}`),
  ]

  if (failures.length) {
    console.error('DATABASE INTEGRITY CHECK FAILED')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.log('PASS: migration state, primary keys, identifiers, and foreign-key references are valid.')
  }
} finally {
  await db.$disconnect()
}
