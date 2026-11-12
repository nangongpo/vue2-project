import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { afterAll, describe, it } from 'vitest'
import { allApiDefinitions } from '#app/security/policies/permission-catalog/index.js'
import { DATA_FIELD_DEFINITIONS } from '#app/security/policies/static-field-definitions.js'
import { PAGE_PERMISSION_BINDINGS } from '#app/database/page-permission-bindings.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(import.meta.url)
const prismaCli = require.resolve('prisma/build/index.js')
const name = `prisma_init_verify_${randomBytes(8).toString('hex')}`
let admin: PrismaClient | undefined
let db: PrismaClient | undefined
let created = false

afterAll(async () => {
  await db?.$disconnect()
  try {
    if (created) {
      await admin!.$executeRawUnsafe(`DROP DATABASE \`${name}\``)
      console.log('已清理本次初始化测试创建的临时数据库。')
    }
  } finally { await admin?.$disconnect() }
})

describe.skipIf(process.env.RUN_LOCAL_INTEGRATION !== 'true')('Prisma empty database initialization', () => {
  it('deploys the migration, enforces boundaries, and seeds the full catalog idempotently', async () => {
    const original = new URL(process.env.DATABASE_URL!)
    assert.ok(['127.0.0.1', 'localhost'].includes(original.hostname), '空库验证仅允许本机 MySQL')
    assert.match(name, /^prisma_init_verify_[a-f0-9]{16}$/)
    const target = new URL(original)
    target.pathname = `/${name}`
    const env: NodeJS.ProcessEnv = { ...process.env, DATABASE_URL: target.toString(),
      DEFAULT_TENANT_CODE: 'init-verify', DEFAULT_TENANT_NAME: '初始化验证租户',
      DEFAULT_ORGANIZATION_CODE: 'init-verify-org', DEFAULT_ORGANIZATION_NAME: '初始化验证组织',
      DEFAULT_DEPARTMENT_CODE: 'init-verify-dept', DEFAULT_DEPARTMENT_NAME: '初始化验证部门' }
    for (const suffix of ['SECURITY', 'SECURITY_2', 'SYSTEM', 'AUDIT']) {
      const prefix = suffix === 'SECURITY_2' ? 'SECURITY' : suffix
      const end = suffix === 'SECURITY_2' ? '_2' : ''
      env[`SEED_${prefix}_USERNAME${end}`] = `verify_${suffix.toLowerCase()}`
      env[`SEED_${prefix}_PASSWORD${end}`] = `Init!${randomBytes(24).toString('base64url')}`
    }
    const run = (args: string[], expectedStatus = 0) => {
      const result = spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 })
      assert.equal(result.status, expectedStatus, result.stderr || result.stdout || '验证子进程失败')
      return result.stdout
    }
    run(['scripts/verify-permission-migration.js', '--source'])
    admin = new PrismaClient({ datasourceUrl: original.toString() })
    await admin.$executeRawUnsafe(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    created = true
    db = new PrismaClient({ datasourceUrl: target.toString() })
    run([prismaCli, 'migrate', 'deploy'])
    run([prismaCli, 'migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--exit-code'])
    run(['scripts/verify-permission-migration.js'])

    // The shared read-only preflight must also detect a disabled CHECK.
    await db.$executeRawUnsafe('ALTER TABLE `sys_user_tenant_membership` ALTER CHECK `sys_user_tenant_membership_scope_boundary_chk` NOT ENFORCED')
    run(['scripts/verify-permission-migration.js'], 1)
    await db.$executeRawUnsafe('ALTER TABLE `sys_user_tenant_membership` ALTER CHECK `sys_user_tenant_membership_scope_boundary_chk` ENFORCED')
    run(['scripts/verify-permission-migration.js'])

    run(['--conditions=development', '--import', 'tsx', 'src/database/seed.ts'])
    const summary = async () => ({ users: await db!.user.count(), roles: await db!.role.count(),
      permissions: await db!.permission.count(), fields: await db!.permissionField.count(),
      memberships: await db!.userTenantMembership.count(), grants: await db!.rolePermission.count(),
      passwordDigest: createHash('sha256').update(JSON.stringify(await db!.user.findMany({ orderBy: { username: 'asc' }, select: { username: true, password: true } }))).digest('hex') })
    const first = await summary()
    run(['--conditions=development', '--import', 'tsx', 'src/database/seed.ts'])
    assert.deepEqual(await summary(), first, '重复 seed 不应增加目录/账号/授权或重置现有口令')

    const permissions = await db.permission.findMany({ where: { status: 'ACTIVE' } })
    for (const api of allApiDefinitions()) {
      const found = permissions.find((permission) => permission.code === api.code)
      assert.ok(found, `缺少 API：${api.code}`)
      assert.equal(found.method, api.method); assert.equal(found.path, api.path)
    }
    const fields = await db.permissionField.findMany()
    for (const definition of DATA_FIELD_DEFINITIONS) {
      const found = fields.find((field) => field.resource === definition.resource && field.field === definition.field)
      assert.ok(found, `缺少字段：${definition.resource}.${definition.field}`)
      assert.equal(found.riskLevel, definition.riskLevel)
      assert.equal(found.readable, definition.readable !== false)
      assert.equal(found.allowCreate, definition.writeOperations?.includes('CREATE') || false)
      assert.equal(found.allowUpdate, definition.writeOperations?.includes('UPDATE') || false)
    }
    for (const [code, bindings] of Object.entries(PAGE_PERMISSION_BINDINGS)) {
      const page = await db.systemFunction.findUniqueOrThrow({ where: { code } })
      for (const binding of bindings) {
        const permission = permissions.find((item) => item.code === binding.apiCode)
        assert.ok(permission, `页面 API 未登记：${binding.apiCode}`)
        if (binding.type === 'PAGE_API') {
          const actual = await db.functionApi.findUniqueOrThrow({ where: { functionId_apiId: { functionId: page.id, apiId: permission.id } } })
          assert.equal(actual.required, binding.required !== false)
        } else {
          const button = await db.functionButton.findUniqueOrThrow({ where: { code: `button.${binding.apiCode}` } })
          assert.equal(button.functionId, page.id); assert.equal(button.name, binding.actionKey)
          await db.buttonApi.findUniqueOrThrow({ where: { buttonId_apiId: { buttonId: button.id, apiId: permission.id } } })
        }
      }
    }
    assert.equal(await db.user.count(), 4)
    assert.equal(await db.userTenantMembership.count({ where: { scopeType: 'PLATFORM', organizationId: null, departmentId: null } }), 4)
    assert.equal(await db.fileObject.count(), 0)
    assert.equal(await db.fileScanJob.count(), 0)
    assert.equal(await db.fileManagementCommand.count(), 0)

    const membership = await db.userTenantMembership.findFirstOrThrow()
    const organization = await db.organization.findFirstOrThrow()
    await assert.rejects(db.userTenantMembership.update({ where: { id: membership.id }, data: { organizationId: organization.id } }), /sys_user_tenant_membership_scope_boundary_chk/)
  }, 90_000)
})
