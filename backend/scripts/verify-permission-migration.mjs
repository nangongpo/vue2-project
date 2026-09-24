// Creates and removes only its own random local MySQL schema; never migrates DATABASE_URL's schema.
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { loadEnvFile } from 'node:process'
import { PrismaClient } from '@prisma/client'
import { DataScopeService } from '../dist/security/data-scope.service.js'
import { PermissionService } from '../dist/modules/permission/permission.service.js'
import { AuthService } from '../dist/security/auth.service.js'
import { createHash } from 'node:crypto'
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import cookie from '@fastify/cookie'
import { AppModule } from '../dist/app.module.js'
import { ApiExceptionFilter } from '../dist/common/api-exception.filter.js'
import { AuditService } from '../dist/audit/audit.service.js'
import { TraceIdInterceptor } from '../dist/common/trace-id.interceptor.js'

try { loadEnvFile() } catch { /* env supplied by CI */ }
const original = new URL(process.env.DATABASE_URL)
if (!['localhost', '127.0.0.1', '[::1]'].includes(original.hostname)) throw new Error('This verification requires a local MySQL server')
const schema = `codex_permission_test_${randomUUID().replaceAll('-', '')}`
assert.match(schema, /^codex_permission_test_[a-f0-9]{32}$/)
const admin = new PrismaClient()
const isolated = new URL(original); isolated.pathname = `/${schema}`
const db = new PrismaClient({ datasourceUrl: isolated.toString() })
const require = createRequire(import.meta.url)
const prismaCli = require.resolve('prisma/build/index.js')
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy'], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: 'pipe' })
  const tenant = await db.tenant.create({ data: { code: 'test', name: 'Test tenant' } })
  const user = await db.user.create({ data: { username: 'owner', displayName: 'owner', passwordHash: 'not-a-real-password', tenantId: tenant.id } })
  const role = await db.role.create({ data: { code: 'operator', name: 'Operator' } })
  await db.userRole.create({ data: { userId: user.id, roleId: role.id } })
  await db.roleDataScope.create({ data: { roleId: role.id, resource: 'order', scopeType: 'SELF' } })
  const scopes = new DataScopeService(db)
  assert.deepEqual(await scopes.where({ internalId: user.id }, 'order'), { AND: [{ tenantId: tenant.id }, { ownerId: user.userId }] })
  await db.tenant.update({ where: { id: tenant.id }, data: { status: 'DISABLED' } })
  await assert.rejects(() => scopes.where({ internalId: user.id }, 'order'))
  await db.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } })

  const service = new PermissionService(db)
  const req = { user: { internalId: user.id, userId: user.userId }, method: 'POST', url: '/api/v1/permission/apis', ip: '127.0.0.1' }
  const api = (await service.createApi({ code: 'order.read', name: 'Order read', method: 'GET', path: '/api/v1/orders', resource: 'order', action: 'read' }, req)).data
  const page = (await service.createFunction({ code: 'page.order', name: 'Orders', route: '/orders', apiIds: [api.id] }, req)).data
  await assert.rejects(() => service.deleteApi(api.id, { ...req, method: 'DELETE' }))
  await assert.rejects(() => service.updateFunction(page.id, { parentId: page.id }, { ...req, method: 'PATCH' }))
  const writeApi = (await service.createApi({ code: 'order.create', name: 'Create order', method: 'POST', path: '/api/v1/orders', resource: 'order', action: 'create' }, req)).data
  await assert.rejects(() => service.mapFunctionApis(page.id, [writeApi.id], { ...req, method: 'PATCH' }))
  assert.equal(await db.functionApi.count({ where: { functionId: page.id, apiId: api.id } }), 1, 'failed binding must roll back')
  const permission = await db.permission.findUniqueOrThrow({ where: { code: 'page.order' } })
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
  const seedEnv = { ...process.env, DATABASE_URL: isolated.toString(), SEED_ADMIN_USERNAME: 'verify_security', SEED_ADMIN_PASSWORD: 'Local-Verify-Password-742!', SEED_SECURITY_REVIEWER_USERNAME: 'verify_reviewer', SEED_SECURITY_REVIEWER_PASSWORD: 'Local-Reviewer-Password-529!', SEED_AUDIT_USERNAME: 'verify_auditor', SEED_AUDIT_PASSWORD: 'Local-Audit-Password-851!', SEED_SYSTEM_USERNAME: '', SEED_SYSTEM_PASSWORD: '' }
  execFileSync(process.execPath, ['dist/database/seed.js'], { env: seedEnv, stdio: 'pipe' })
  const seeded = await db.user.findUniqueOrThrow({ where: { username: 'verify_security' } })
  execFileSync(process.execPath, ['dist/database/seed.js'], { env: { ...seedEnv, SEED_ADMIN_PASSWORD: 'Different-Password-924!' }, stdio: 'pipe' })
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: seeded.id } })).passwordHash, seeded.passwordHash, 'repeat seed must not reset passwords')
  const adminToken = randomUUID(), auditorToken = randomUUID(), reviewerToken = randomUUID()
  const auditor = await db.user.findUniqueOrThrow({ where: { username: 'verify_auditor' } })
  const reviewer = await db.user.findUniqueOrThrow({ where: { username: 'verify_reviewer' } })
  for (const [account, rawToken] of [[seeded, adminToken], [auditor, auditorToken], [reviewer, reviewerToken]]) {
    await db.user.update({ where: { id: account.id }, data: { mfaEnabled: true } })
    await db.session.create({ data: { id: createHash('sha256').update(rawToken).digest('hex'), userId: account.id, expiresAt: new Date(Date.now() + 600000), mfaVerifiedAt: new Date(), reauthenticatedAt: new Date() } })
  }
  process.env.DATABASE_URL = isolated.toString()
  process.env.REDIS_ENABLED = 'false'
  process.env.CSRF_ALLOWED_ORIGINS = 'http://localhost'
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
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/functions' })).statusCode, 401)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/functions', headers })).statusCode, 200)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/apis?pageSize=101', headers })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers, payload: { code: 'page.http', name: 'HTTP page', route: '/http', roleType: 'SECURITY' } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers, payload: { code: 'page.missing-name', route: '/missing-name' } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/buttons', headers, payload: { code: 'button.missing-label', name: 'Missing label', functionId: page.id } })).statusCode, 400)
    assert.equal((await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers: { ...headers, origin: 'https://attacker.invalid' }, payload: { code: 'page.http', name: 'HTTP page', route: '/http' } })).statusCode, 403)
    const created = await server.inject({ method: 'POST', url: '/api/v1/permission/functions', headers, payload: { code: 'page.http', name: 'HTTP page', route: '/http' } })
    assert.equal(created.statusCode, 201, created.body)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/audit-logs', headers })).statusCode, 403, 'security admin must not query audit data')
    const auditHeaders = { ...headers, cookie: `app_session=${auditorToken}` }
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/audit-logs', headers: auditHeaders })).statusCode, 200)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/functions', headers: auditHeaders })).statusCode, 403)
    assert.equal((await server.inject({ method: 'GET', url: '/api/v1/permission/approvals', headers: auditHeaders })).statusCode, 200, 'shared approval reads remain explicitly accessible to audit')
    const reviewerHeaders = { ...headers, cookie: `app_session=${reviewerToken}` }
    for (const kind of ['ROLE_GRANT', 'ROLE_REVOKE']) {
      const submitted = await server.inject({ method: 'POST', url: '/api/v1/permission/approvals', headers, payload: { kind, reason: 'isolated verification', expiresAt: new Date(Date.now() + 300000).toISOString(), payload: { userId: user.userId, roleId: role.roleId } } })
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
