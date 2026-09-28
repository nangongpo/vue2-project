// Creates and removes only its own random local MySQL schema; never migrates DATABASE_URL's schema.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { DataScopeService } from '#app/security/services/data-scope.service.js'
import { PermissionService } from '#app/modules/permission/services/permission.service.js'
import { AuthService } from '#app/security/services/auth.service.js'
import { createHash } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import cookie from '@fastify/cookie'
import { AppModule } from '#app/app.module.js'
import { ApiExceptionFilter } from '#app/common/filters/api-exception.filter.js'
import { AuditService } from '#app/audit/services/audit.service.js'
import { TraceIdInterceptor } from '#app/common/interceptors/trace-id.interceptor.js'
import { allApiDefinitions, allowedRoleTypesForPermission } from '#app/security/policies/permission-catalog/index.js'

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
try { loadEnvFile(resolve(backendRoot, '.env')) } catch { /* env supplied by CI */ }
const original = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1', '[::1]'].includes(original.hostname)) throw new Error('This verification requires a local MySQL server')
const schema = `codex_permission_test_${randomUUID().replaceAll('-', '')}`
assert.match(schema, /^codex_permission_test_[a-f0-9]{32}$/)
const admin = new PrismaClient()
const isolated = new URL(original); isolated.pathname = `/${schema}`
const db = new PrismaClient({ datasourceUrl: isolated.toString() })
const require = createRequire(import.meta.url)
const prismaCli = require.resolve('prisma/build/index.js')

async function assertPermissionCatalogMatchesDatabase(db) {
  const catalog = allApiDefinitions()
  const codes = catalog.map((entry) => entry.code)
  const rows = await db.permission.findMany({
    where: { code: { in: codes } },
    select: {
      code: true,
      type: true,
      method: true,
      path: true,
      resource: true,
      action: true,
      roleTypes: { select: { roleType: true } },
    },
  })
  const byCode = new Map(rows.map((row) => [row.code, row]))
  for (const entry of catalog) {
    const row = byCode.get(entry.code)
    assert.ok(row, `catalog permission is missing from database: ${entry.code}`)
    assert.deepEqual(
      {
        type: row.type,
        method: row.method,
        path: row.path,
        resource: row.resource,
        action: row.action,
      },
      {
        type: 'API',
        method: entry.method,
        path: entry.path,
        resource: entry.resource,
        action: entry.action,
      },
      `catalog API metadata differs from database: ${entry.code}`
    )
    assert.deepEqual(
      row.roleTypes.map((item) => item.roleType).sort(),
      [...allowedRoleTypesForPermission({ code: entry.code, type: 'API' })].sort(),
      `catalog role policy differs from database: ${entry.code}`
    )
  }
}

try {
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendRoot,
    env: { ...process.env, DATABASE_URL: isolated.toString() },
    stdio: 'pipe',
  })
  const migrationRows = await db.$queryRawUnsafe('SELECT COUNT(*) AS count FROM `_prisma_migrations`')
  assert.equal(Number(migrationRows[0].count), 1, 'baseline migration must be the only applied migration')
  const roleTypeTableRows = await db.$queryRawUnsafe(`
    SELECT COUNT(*) AS count
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'sys_permission_role_type'
  `)
  assert.equal(Number(roleTypeTableRows[0].count), 1, 'explicit permission role table must exist')
  const tenant = await db.tenant.create({ data: { code: 'test', name: 'Test tenant' } })
  const user = await db.user.create({ data: { username: 'owner', displayName: 'owner', passwordHash: 'not-a-real-password', tenantId: tenant.id } })
  const role = await db.role.create({ data: { code: 'operator', name: 'Operator' } })
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } })
  await db.dataResource.create({ data: { code: 'order', name: '订单' } })
  await db.roleDataScope.create({ data: { roleId: role.id, resource: 'order', scopeType: 'SELF' } })
  const scopes = new DataScopeService(db)
  assert.deepEqual(await scopes.where({ internalId: user.id }, 'order'), { AND: [{ tenantId: tenant.id }, { ownerId: user.userId }] })
  await db.tenant.update({ where: { id: tenant.id }, data: { status: 'DISABLED' } })
  await assert.rejects(() => scopes.where({ internalId: user.id }, 'order'))
  await db.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } })

  const service = new PermissionService(db)
  const req = { user: { internalId: user.id, userId: user.userId }, method: 'POST', url: '/api/v1/permission/apis', ip: '127.0.0.1' }
  const api = (await service.createApi({ code: 'order.read', name: 'Order read', method: 'GET', path: '/api/v1/orders', resource: 'order', action: 'read' }, req)).data
  const page = (await service.createFunction({
    code: 'page.order',
    name: 'Orders',
    route: '/orders',
    component: 'business/order/index',
    apiIds: [api.id],
  }, req)).data
  await assert.rejects(() => service.deleteApi(api.id, { ...req, method: 'DELETE' }))
  await assert.rejects(() => service.updateFunction(page.id, { parentId: page.id }, { ...req, method: 'PATCH' }))
  const writeApi = (await service.createApi({ code: 'order.create', name: 'Create order', method: 'POST', path: '/api/v1/orders', resource: 'order', action: 'create' }, req)).data
  await assert.rejects(() => service.mapFunctionApis(page.id, [writeApi.id], { ...req, method: 'PATCH' }))
  assert.equal(await db.functionApi.count({ where: { functionId: page.id, apiId: api.id } }), 1, 'failed binding must roll back')
  const permission = await db.permission.findUniqueOrThrow({ where: { code: page.code } })
  // This page is intentionally created as a dynamic BUSINESS permission before
  // seed. It must not be auto-granted to the built-in role; normal authorization
  // is responsible for assigning it explicitly.
  const unmanagedPermissionIds = new Set([permission.id])
  await db.rolePermission.createMany({ data: [permission.id, api.id].map(permissionId => ({ roleId: role.id, permissionId })) })
  const token = randomUUID()
  await db.session.create({ data: { id: createHash('sha256').update(token).digest('hex'), userId: user.id, expiresAt: new Date(Date.now() + 60000) } })
  const auth = new AuthService(db, {}, {})
  assert.ok((await auth.authenticate(token)).permissions.includes('order.read'))
  await service.setStatus('page', page.id, 'DISABLED', { ...req, method: 'PATCH' })
  assert.ok(!(await auth.authenticate(token)).permissions.includes('order.read'), 'page disable must immediately invalidate bound API')
  await service.setStatus('page', page.id, 'ACTIVE', { ...req, method: 'PATCH' })
  await db.rolePermission.updateMany({ where: { roleId: role.id, permissionId: api.id }, data: { expiresAt: new Date(0) } })
  assert.ok(!(await auth.authenticate(token)).permissions.includes('order.read'), 'expired grant must immediately fail closed')

  const audit = await db.auditLog.findFirstOrThrow()
  await assert.rejects(() => db.auditLog.update({ where: { id: audit.id }, data: { detail: {} } }))
  await assert.rejects(() => db.auditLog.delete({ where: { id: audit.id } }))
  await assert.rejects(() => db.roleElevatedDataScope.create({ data: { roleId: role.id, resource: 'order', scopeType: 'ALL', reason: 'invalid', approvalRef: randomUUID(), validFrom: new Date(), expiresAt: new Date(0) } }))
  // Exercise the actual seed, repeated seed, global guards, DTO validation and DB-backed HTTP routes.
  const seedEnv = { ...process.env, DATABASE_URL: isolated.toString(), AUDIT_INTEGRITY_SECRET: 'isolated-audit-integrity-secret-0123456789', SEED_SECURITY_USERNAME: 'verify_security', SEED_SECURITY_PASSWORD: 'Local-Verify-Password-742!', SEED_SECURITY_USERNAME_2: 'verify_security_2', SEED_SECURITY_PASSWORD_2: 'Local-Verify-Password-963!', SEED_AUDIT_USERNAME: 'verify_auditor', SEED_AUDIT_PASSWORD: 'Local-Audit-Password-851!', SEED_SYSTEM_USERNAME: 'verify_system', SEED_SYSTEM_PASSWORD: 'Local-System-Password-638!' }
  execFileSync(process.execPath, [resolve(backendRoot, 'dist/database/seed.js')], {
    cwd: backendRoot,
    env: seedEnv,
    stdio: 'pipe',
  })
  await assertPermissionCatalogMatchesDatabase(db)
  const seeded = await db.user.findUniqueOrThrow({ where: { username: 'verify_security' } })
  execFileSync(process.execPath, [resolve(backendRoot, 'dist/database/seed.js')], {
    cwd: backendRoot,
    env: { ...seedEnv, SEED_SECURITY_PASSWORD: 'Different-Password-924!' },
    stdio: 'pipe',
  })
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: seeded.id } })).passwordHash, seeded.passwordHash, 'repeat seed must not reset passwords')
  const adminToken = randomUUID(), auditorToken = randomUUID(), reviewerToken = randomUUID()
  const auditor = await db.user.findUniqueOrThrow({ where: { username: 'verify_auditor' } })
  const securityRole = await db.role.findUniqueOrThrow({ where: { code: 'builtin_security' } })
  const reviewer = await db.user.findUniqueOrThrow({ where: { username: 'verify_security_2' } })
  for (const [account, rawToken] of [[seeded, adminToken], [auditor, auditorToken], [reviewer, reviewerToken]]) {
    await db.user.update({ where: { id: account.id }, data: { mfaEnabled: true, mfaSecret: 'encrypted-test-secret' } })
    await db.session.create({ data: { id: createHash('sha256').update(rawToken).digest('hex'), userId: account.id, expiresAt: new Date(Date.now() + 600000), mfaVerifiedAt: new Date(), reauthenticatedAt: new Date() } })
  }
  process.env.DATABASE_URL = isolated.toString()
  process.env.AUDIT_INTEGRITY_SECRET = seedEnv.AUDIT_INTEGRITY_SECRET
  process.env.REDIS_ENABLED = 'false'
  process.env.CSRF_ALLOWED_ORIGINS = 'http://localhost'
  const seededPageRead = await db.permission.findUniqueOrThrow({ where: { code: 'system.page.read' }, include: { roleTypes: true } })
  assert.ok(seededPageRead.roleTypes.some((item) => item.roleType === 'SECURITY'), 'system.page.read must allow SECURITY')
    assert.ok(
      await db.rolePermission.findFirst({ where: { roleId: securityRole.id, permissionId: seededPageRead.id, revokedAt: null } }),
      'builtin_security must receive system.page.read'
    )
    const activePermissions = await db.permission.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        code: true,
        roleTypes: { select: { roleType: true } },
        fieldReadDefinitions: { select: { status: true } },
        fieldWriteDefinitions: { select: { status: true } },
      },
    })
    const builtinRoles = await db.role.findMany({
      where: { code: { in: ['builtin_business', 'builtin_security', 'builtin_system', 'builtin_audit'] } },
      select: { code: true, id: true, roleType: true },
    })
    for (const role of builtinRoles) {
      const expected = new Set(
        activePermissions
          .filter((permission) => !unmanagedPermissionIds.has(permission.id))
          // Disabled field definitions must not remain in built-in role grants,
          // even when their legacy permission row is still ACTIVE.
          .filter((permission) =>
            [...permission.fieldReadDefinitions, ...permission.fieldWriteDefinitions]
              .every((field) => field.status === 'ACTIVE')
          )
          .filter((permission) => permission.roleTypes.some((item) => item.roleType === role.roleType))
          .map((permission) => permission.id)
      )
      const granted = new Set(
        (
          await db.rolePermission.findMany({
            where: { roleId: role.id, revokedAt: null },
            select: { permissionId: true },
          })
        )
          .map((grant) => grant.permissionId)
          .filter((permissionId) => !unmanagedPermissionIds.has(permissionId))
      )
      const codes = new Map(activePermissions.map((permission) => [permission.id, permission.code]))
      assert.deepEqual(
        [...granted].map((id) => codes.get(id)).sort(),
        [...expected].map((id) => codes.get(id)).sort(),
        `${role.code} grants must exactly match active permission responsibility relations`
      )
    }
    const app = await NestFactory.create(AppModule, new FastifyAdapter(), { logger: false })
  try {
    await app.register(cookie)
    app.setGlobalPrefix('api/v1')
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
    app.useGlobalInterceptors(new TraceIdInterceptor())
    app.useGlobalFilters(new ApiExceptionFilter(app.get(AuditService)))
    await app.init()
    const server = app.getHttpAdapter().getInstance()
    const headers = { cookie: `app_session=${adminToken}`, origin: 'http://localhost' }
    const businessRole = await db.role.findUniqueOrThrow({ where: { code: 'builtin_business' }, select: { roleId: true } })
    const businessUserResponse = await server.inject({
      method: 'POST',
      url: '/api/v1/users',
      headers,
      payload: {
        username: 'verify_business',
        password: 'Local-Business-Password-742!',
        displayName: 'verify_business',
      },
    })
    assert.equal(businessUserResponse.statusCode, 201, businessUserResponse.body)
    const businessUserId = businessUserResponse.json().data?.userId
    assert.match(businessUserId, /^[0-9a-f-]{36}$/)
    const businessRoleResponse = await server.inject({
      method: 'PATCH',
      url: `/api/v1/users/${businessUserId}/roles`,
      headers,
      payload: {
        roleIds: [businessRole.roleId],
        reason: '验证安全管理员创建业务用户并分配业务角色',
      },
    })
    assert.equal(businessRoleResponse.statusCode, 200, businessRoleResponse.body)
    const businessToken = randomUUID()
    const businessAccount = await db.user.findUniqueOrThrow({ where: { userId: businessUserId } })
    await db.session.create({
      data: {
        id: createHash('sha256').update(businessToken).digest('hex'),
        userId: businessAccount.id,
        expiresAt: new Date(Date.now() + 600000),
      },
    })
    const businessUser = await new AuthService(db, {}, {}).authenticate(businessToken)
    assert.ok(
      businessUser.navigation?.some((item) => item.path === '/business/order-manage'),
      'business user navigation must include order management after role assignment'
    )
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/functions' })).statusCode, 401)
    const functionsResponse = await server.inject({ method: 'GET', url: '/api/v1/permission/functions', headers })
    assert.equal(functionsResponse.statusCode, 200, functionsResponse.body)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/apis?pageSize=101', headers })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers, payload: { code: 'page.http', name: 'HTTP page', route: '/http', roleType: 'SECURITY' } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers, payload: { code: 'page.missing-name', route: '/missing-name' } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/buttons', headers, payload: { code: 'button.missing-label', name: 'Missing label', functionId: page.id } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers: { ...headers, origin: 'https://attacker.invalid' }, payload: { code: 'page.http', name: 'HTTP page', route: '/http' } })).statusCode, 403)
    const created = await server.inject({
      method: 'POST',
      url: '/api/v1/permission/functions',
      headers,
      payload: {
        code: 'page.http',
        name: 'HTTP page',
        route: '/http',
        component: 'business/http/index',
      },
    })
    assert.equal(created.statusCode, 201, created.body)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/audit-logs', headers })).statusCode, 403, 'security admin must not query audit data')
    const auditHeaders = { ...headers, cookie: `app_session=${auditorToken}` }
    const auditPage = await server.inject({ method: 'GET', url: '/api/v1/audit-logs', headers: auditHeaders })
    assert.equal(auditPage.statusCode, 200, auditPage.body)
    const auditItems = auditPage.json().data?.items || []
    assert.ok(
      auditItems.some((item) => item && Object.keys(item).length > 0),
      'audit administrator must receive readable audit fields rather than empty objects'
    )
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/functions', headers: auditHeaders })).statusCode, 403)
    const auditApprovals = await server.inject({ method: 'GET', url: '/api/v1/permission/approvals', headers: auditHeaders })
    assert.equal(auditApprovals.statusCode, 200, 'shared approval reads remain explicitly accessible to audit')
    const approvalItems = auditApprovals.json().data?.items || []
    assert.ok(
      approvalItems.every((item) => item && Object.keys(item).length > 0),
      'audit approval reads must not be reduced to empty objects by field security'
    )
    const reviewerHeaders = { ...headers, cookie: `app_session=${reviewerToken}` }
    for (const kind of ['ROLE_GRANT', 'ROLE_REVOKE']) {
      const targetRef = async (targetType, keyword) => {
        const response = await server.inject({
          method: 'GET',
          url: `/api/v1/permission/approvals/target-options?kind=${kind}&targetType=${targetType}&keyword=${keyword}`,
          headers,
        })
        assert.equal(response.statusCode, 200, response.body)
        const items = response.json().data.items
        assert.ok(items.length, `target-options must return ${targetType} for ${kind}`)
        return items[0].targetRef
      }
      const submitted = await server.inject({
        method: 'POST',
        url: '/api/v1/permission/approvals',
        headers,
        payload: {
          kind,
          reason: 'isolated verification',
          expiresAt: new Date(Date.now() + 300000).toISOString(),
          payload: { userRef: await targetRef('USER', 'owner'), roleRef: await targetRef('ROLE', 'operator') },
        },
      })
      assert.equal(submitted.statusCode, 201, submitted.body)
      const approvalId = submitted.json().data.id
      const action = (step, requestHeaders) => server.inject({ method: 'POST', url: `/api/v1/permission/approvals/${approvalId}/${step}`, headers: requestHeaders, payload: { note: 'independent verification' } })
      assert.equal((await action('approve', headers)).statusCode, 403)
      const approved = await action('approve', reviewerHeaders)
      assert.equal(approved.statusCode, 200, approved.body)
      const executed = await action('execute', reviewerHeaders)
      assert.equal(executed.statusCode, 200, executed.body)
      assert.equal((await action('execute', reviewerHeaders)).statusCode, 409)
      const reviewed = await action('review', auditHeaders)
      assert.equal(reviewed.statusCode, 200, reviewed.body)
    }
    assert.ok((await db.userRole.findUniqueOrThrow({ where: { userId_roleId: { userId: user.id, roleId: role.id } } })).revokedAt)
    const exported = await server.inject({ method: 'GET', url: `/api/v1/audit-logs/export?from=${encodeURIComponent(new Date(Date.now() - 60000).toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 1000).toISOString())}`, headers: auditHeaders })
    assert.equal(exported.statusCode, 200, exported.body)
    await db.session.updateMany({ where: { userId: seeded.id }, data: { mfaVerifiedAt: null } })
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/functions', headers })).statusCode, 403)
    console.log('PASS: idempotent seed, real HTTP 401/403/400/201/409, strict DTO, CSRF, role separation, approval grant/revoke/review, audit export and MFA enforcement')
  } finally { await app.close() }
  console.log('PASS: isolated MySQL migrations, tenant isolation, explicit bindings, cycle/deletion protection, rollback, expiry/state propagation, audit append-only and elevated expiry checks')
} catch (error) {
  if (error?.stderr) console.error(String(error.stderr))
  throw error
} finally {
  await db.$disconnect()
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS \`${schema}\``)
  await admin.$disconnect()
  console.log('Removed the isolated verification schema; existing project database unchanged.')
}
