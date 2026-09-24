import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PermissionGuard } from '../guards/permission.guard.js'
import { REQUIRED_PERMISSIONS } from '../decorators/permission.decorator.js'
import { SESSION_COOKIE } from '../services/auth.service.js'
import { SECURITY_OPERATION } from '../decorators/operation.decorator.js'

const code = 'system.role.grant'
const path = '/api/v1/roles/:id/grants'
const authorized = () => ({
  permissions: [code],
  apiPermissions: [{ code, method: 'PATCH', path }],
  mfaRequired: false,
  mfaVerifiedAt: new Date(),
  reauthenticatedAt: new Date(),
})
function fixture(required: string[] | undefined = [code], overrides: Record<string, unknown> = {}, auth?: any) {
  const handler = () => undefined
  class Controller {}
  if (required !== undefined) Reflect.defineMetadata(REQUIRED_PERMISSIONS, required, handler)
  const request: any = {
    method: 'PATCH',
    routeOptions: { url: path },
    url: '/api/v1/roles/a-real-uuid/grants?ignored=true',
    user: authorized(),
    ...overrides,
  }
  const context = {
    getHandler: () => handler,
    getClass: () => Controller,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
  return { request, guard: new PermissionGuard(new Reflector(), auth), context, handler }
}

describe('PermissionGuard', () => {
  it('denies missing permission metadata even with matching grants', async () => {
    const { guard, context, handler } = fixture()
    Reflect.deleteMetadata(REQUIRED_PERMISSIONS, handler)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('denies empty permission metadata', async () => {
    const { guard, context } = fixture([])
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows only the exact exempt method/template without metadata', async () => {
    const allowed = fixture([], {
      method: 'GET',
      routeOptions: { url: '/api/v1/health' },
      user: undefined,
    })
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true)
    for (const request of [
      { method: 'POST', routeOptions: { url: '/api/v1/health' } },
      { method: 'GET', routeOptions: { url: '/api/v1/health/:id' } },
    ]) {
      const denied = fixture([], request)
      await expect(denied.guard.canActivate(denied.context)).rejects.toBeInstanceOf(ForbiddenException)
    }
  })

  it('matches the explicit code, method and Fastify template, not the concrete URL', async () => {
    const { guard, context } = fixture()
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it.each([
    { method: 'POST' },
    { routeOptions: { url: '/api/v1/users/:id/roles' } },
    { routeOptions: { url: '/api/v1/roles/:roleId/grants' } },
    {
      user: {
        permissions: [code],
        apiPermissions: [{ code: 'system.user.grant', method: 'PATCH', path }],
      },
    },
    { user: { permissions: [code], apiPermissions: [] } },
    { user: undefined },
  ])('denies a wrong or missing authorization component: %j', async (overrides) => {
    const { guard, context } = fixture([code], overrides)
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('never falls back to the raw URL when the matched template is missing', async () => {
    const { guard, context } = fixture([code], { routeOptions: undefined, url: path })
    await expect(guard.canActivate(context)).rejects.toThrow()
  })

  it('normalizes trailing slashes but rejects wildcard/encoded/query templates', async () => {
    const allowed = fixture([code], { routeOptions: { url: `${path}/` } })
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true)
    for (const route of ['/api/v1/roles/*', '/api/v1/roles/%3Aid/grants', `${path}?scope=all`]) {
      const denied = fixture([code], { routeOptions: { url: route } })
      await expect(denied.guard.canActivate(denied.context)).rejects.toThrow()
    }
  })

  it.each([
    {
      permissions: ['*'],
      apiPermissions: [{ code: '*', method: 'PATCH', path }],
      isSuperAdmin: true,
    },
    { permissions: [], apiPermissions: [], isSuperAdmin: true },
    {
      permissions: [code],
      apiPermissions: [{ code: '*', method: 'PATCH', path }],
      isSuperAdmin: true,
    },
  ])('does not allow wildcard or super-admin bypass: %j', async (user) => {
    const { guard, context } = fixture([code], { user })
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('requires additional revoke capability without requiring a second API for the same route', async () => {
    const denied = fixture([code, 'system.role.revoke'])
    await expect(denied.guard.canActivate(denied.context)).rejects.toBeInstanceOf(ForbiddenException)
    const allowed = fixture([code, 'system.role.revoke'], {
      user: { ...authorized(), permissions: [code, 'system.role.revoke'] },
    })
    await expect(allowed.guard.canActivate(allowed.context)).resolves.toBe(true)
  })

  it.each([
    { mfaEnabled: false, mfaVerifiedAt: null },
    { mfaEnabled: true, mfaVerifiedAt: null },
  ])('requires verified MFA for administrators: %j', async (mfa) => {
    const { guard, context } = fixture([code], {
      user: { ...authorized(), mfaRequired: true, ...mfa },
    })
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException)
  })

  it('allows an administrator with an MFA-verified session and exact grant', async () => {
    const { guard, context } = fixture([code], {
      user: {
        ...authorized(),
        mfaRequired: true,
        mfaEnabled: true,
        mfaVerifiedAt: new Date(),
        reauthenticatedAt: new Date(),
      },
    })
    await expect(guard.canActivate(context)).resolves.toBe(true)
  })

  it('authenticates missing context and propagates authentication outages closed', async () => {
    const auth = { authenticate: vi.fn().mockResolvedValue(authorized()) }
    const { guard, context } = fixture([code], { user: undefined, cookies: { [SESSION_COOKIE]: 'session' } }, auth)
    await expect(guard.canActivate(context)).resolves.toBe(true)
    expect(auth.authenticate).toHaveBeenCalledWith('session', 'AUTHENTICATED')
    const outage = fixture([code], { user: undefined }, { authenticate: vi.fn().mockRejectedValue(new Error('Unavailable')) })
    await expect(outage.guard.canActivate(outage.context)).rejects.toThrow('Unavailable')
  })

  it('enforces an explicit operation policy on an authenticated self-service route without permissions', async () => {
    const { context, request, handler } = fixture([], {
      method: 'POST',
      routeOptions: { url: '/api/v1/auth/password' },
      user: { ...authorized(), mfaVerifiedAt: null, reauthenticatedAt: null },
    })
    Reflect.defineMetadata(SECURITY_OPERATION, 'auth.password.change', handler)
    const policies = { resolve: vi.fn().mockResolvedValue({ riskLevel: 'L2' }) }
    const secured = new PermissionGuard(new Reflector(), undefined, policies as any)
    await expect(secured.canActivate(context)).rejects.toMatchObject({ response: expect.objectContaining({ code: '100013' }) })
    expect(request.operationCode).toBe('auth.password.change')
    expect(policies.resolve).toHaveBeenCalledWith('auth.password.change')
  })
})
