// Read-only verification of generic database integrity.
// This script does not infer the application table catalog from migration files.
// It does verify the required tenant-membership authorization boundary.
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

/** @param {unknown} value @returns {Array<Record<string, unknown>>} */
const queryRows = (value) => (Array.isArray(value) ? value : [])

try {
  const migrationFailures = queryRows(await db.$queryRawUnsafe(`
    SELECT migration_name, started_at, finished_at, rolled_back_at
    FROM _prisma_migrations
    WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL
  `))

  const tablesWithoutPrimaryKey = queryRows(await db.$queryRawUnsafe(`
    SELECT tables.table_name
    FROM information_schema.tables AS tables
    LEFT JOIN information_schema.table_constraints AS pk
      ON pk.table_schema = tables.table_schema
     AND pk.table_name = tables.table_name
     AND pk.constraint_type = 'PRIMARY KEY'
    WHERE tables.table_schema = DATABASE()
      AND tables.table_type = 'BASE TABLE'
      AND pk.table_name IS NULL
  `))

  const invalidIdentifiers = queryRows(await db.$queryRawUnsafe(`
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
      AND index_name <> 'PRIMARY'
      AND (index_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(index_name) > 64)
    UNION ALL
    SELECT 'CONSTRAINT' AS object_type, table_name, constraint_name AS object_name
    FROM information_schema.table_constraints
    WHERE table_schema = DATABASE()
      AND constraint_name <> 'PRIMARY'
      AND (constraint_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(constraint_name) > 64)
  `))

  const invalidForeignKeys = queryRows(await db.$queryRawUnsafe(`
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
  `))

  const missingMembershipBoundary = queryRows(await db.$queryRawUnsafe(`
    SELECT 'MISSING_MEMBERSHIP_BOUNDARY' AS check_type, 'sys_user_tenant_membership' AS object_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'sys_user_tenant_membership'
        AND column_name = 'scope_type'
    )
       OR NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema = DATABASE()
        AND table_name = 'sys_user_tenant_membership'
        AND constraint_name = 'sys_user_tenant_membership_scope_boundary_chk'
    )
  `))

  const missingRoleTenantBoundary = queryRows(await db.$queryRawUnsafe(`
    SELECT 'MISSING_ROLE_TENANT_BOUNDARY' AS check_type, 'sys_role.tenant_id' AS object_name
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'sys_role'
        AND column_name = 'tenant_id'
        AND is_nullable = 'NO'
    )
       OR NOT EXISTS (
      SELECT 1
      FROM information_schema.referential_constraints AS rc
      JOIN information_schema.key_column_usage AS kcu
        ON kcu.constraint_schema = rc.constraint_schema
       AND kcu.constraint_name = rc.constraint_name
       AND kcu.table_name = rc.table_name
      WHERE rc.constraint_schema = DATABASE()
        AND rc.table_name = 'sys_role'
        AND kcu.column_name = 'tenant_id'
        AND kcu.referenced_table_name = 'sys_tenant'
        AND kcu.referenced_column_name = 'id'
    )
  `))

  const failures = [
    ...migrationFailures.map((row) => `migration not completed: ${row.migration_name}`),
    ...tablesWithoutPrimaryKey.map((row) => `table without primary key: ${row.table_name}`),
    ...invalidIdentifiers.map((row) => `${row.object_type} has invalid identifier: ${row.table_name}.${row.object_name}`),
    ...invalidForeignKeys.map((row) => `invalid foreign key: ${row.table_name}.${row.column_name}`),
    ...missingMembershipBoundary.map((row) => `missing membership authorization boundary: ${row.object_name}`),
    ...missingRoleTenantBoundary.map((row) => `missing role tenant boundary: ${row.object_name}`),
  ]

  if (failures.length) {
    console.error('DATABASE INTEGRITY CHECK FAILED')
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
  } else {
    console.log('PASS: migration state, primary keys, identifiers, constraints, and foreign-key references are valid.')
  }
} finally {
  await db.$disconnect()
}
