// Default: read-only database metadata preflight from permission-preflight.sql.
// --source: offline migration/schema checks; never creates a database or runs seed.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Set(process.argv.slice(2))
assert.ok([...args].every((arg) => ['--source', '--single-baseline'].includes(arg)), '不支持的校验参数')
assert.ok(!args.has('--single-baseline') || args.has('--source'), '--single-baseline 需配合 --source 使用')

function verifySource() {
  const directory = resolve(backendRoot, 'prisma/migrations')
  const names = readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort()
  assert.ok(names.length, '缺少数据库迁移')
  if (args.has('--single-baseline')) assert.equal(names.length, 1, '当前合并验收要求仅一个基线迁移')
  assert.match(readFileSync(resolve(directory, 'migration_lock.toml'), 'utf8'), /provider\s*=\s*"mysql"/)
  const scripts = names.map((name) => readFileSync(resolve(directory, name, 'migration.sql'), 'utf8'))
  for (const script of scripts) {
    for (const [, identifier] of script.matchAll(/(?:CREATE TABLE|CONSTRAINT|(?:UNIQUE )?INDEX)\s+`([^`]+)`/g)) {
      assert.ok(identifier.length <= 64, `MySQL 标识符超过 64 个字符：${identifier}`)
    }
  }
  assert.match(scripts.join('\n'), /ALTER TABLE `sys_user_tenant_membership` ADD CONSTRAINT `sys_user_tenant_membership_scope_boundary_chk` CHECK/)
  assert.doesNotMatch(scripts[0], /^\s*(UPDATE|DELETE|DROP|INSERT)\b/im, '空库基线不得混入历史数据回填或删除')
  if (names.length === 1) {
    const require = createRequire(import.meta.url)
    const generated = spawnSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], {
      cwd: backendRoot, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL || 'mysql://unused:unused@127.0.0.1:3306/unused' },
    })
    assert.equal(generated.status, 0, generated.stderr || 'Prisma SQL 生成失败')
    // CHECK has one authoritative definition in migration.sql. Prisma omits it
    // from generated SQL; database integration tests verify its actual behavior.
    const ordinarySql = scripts[0].replace(/ALTER TABLE `sys_user_tenant_membership` ADD CONSTRAINT `sys_user_tenant_membership_scope_boundary_chk` CHECK\s*\([\s\S]*?\);/g, '')
    const normalize = (sql) => sql.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('--')).join('\n')
    assert.equal(normalize(ordinarySql), normalize(generated.stdout), '初始化 SQL 与当前 schema 不一致')
    console.log(`PASS: 初始化基线与 schema 一致，${[...ordinarySql.matchAll(/^CREATE TABLE /gm)].length} 张表，CHECK 已保留。`)
  } else {
    console.log(`PASS: ${names.length} 个迁移的源文件检查通过；累计结构一致性由空库集成测试验证。`)
  }
}

async function verifyDatabase() {
  try { loadEnvFile(resolve(backendRoot, '.env')) } catch { /* Environment may be injected. */ }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  const db = new PrismaClient()
  try {
    const sql = readFileSync(resolve(backendRoot, 'prisma/permission-preflight.sql'), 'utf8')
    const queries = sql.replace(/^\s*--[^\n]*/gm, '').split(';').map((query) => query.trim()).filter(Boolean)
    const failures = []
    for (const [index, query] of queries.entries()) {
      assert.match(query, /^SELECT\b/i, '数据库预检仅允许 SELECT')
      const rows = await db.$queryRawUnsafe(query)
      if (Array.isArray(rows) && rows.length) failures.push({ check: index + 1, rows })
    }
    if (failures.length) {
      console.error('DATABASE INTEGRITY CHECK FAILED')
      for (const failure of failures) console.error(JSON.stringify(failure))
      process.exitCode = 1
    } else {
      console.log('PASS: migration state, primary keys, identifiers, enforced constraints, and foreign-key references are valid.')
    }
  } finally { await db.$disconnect() }
}

if (args.has('--source')) verifySource()
else await verifyDatabase()
