import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AuthController } from '../controllers/auth.controller.js'

describe('AuthController password audit context', () => {
  it('does not expose the internal account status code from /auth/me', () => {
    const controller = new AuthController({} as any)
    const result = controller.me({
      ip: '127.0.0.1',
      user: {
        userId: 'user-1',
        username: 'security',
        displayName: '安全管理员',
        status: 'ACTIVE',
        roles: [],
        permissions: [],
        isSuperAdmin: false,
      },
    } as any)
    expect(result.data).toMatchObject({ statusLabel: '启用', isActive: true, isLocked: false })
    expect(result.data).not.toHaveProperty('status')
  })

  it('returns only display names for roles from /auth/me', () => {
    const controller = new AuthController({} as any)
    const result = controller.me({
      ip: '127.0.0.1',
      user: {
        userId: 'user-1',
        username: 'security',
        displayName: '安全管理员',
        status: 'ACTIVE',
        roles: [{ roleId: 'role-1', code: 'builtin_security', name: '安全管理员', roleType: 'SECURITY' }],
        permissions: [],
        isSuperAdmin: false,
      },
    } as any)
    expect(result.data.roles).toEqual([{ name: '安全管理员' }])
    expect(result.data.roles[0]).not.toHaveProperty('roleId')
    expect(result.data.roles[0]).not.toHaveProperty('code')
    expect(result.data.roles[0]).not.toHaveProperty('roleType')
  })

  it('forwards server request context and role types to the transactional audit', async () => {
    const auth = { changePassword: vi.fn().mockResolvedValue({ expiresIn: 0 }) }
    const request = {
      traceId: 'server-trace',
      ip: '127.0.0.1',
      headers: { 'user-agent': 'test-client', 'x-request-trace-id': 'untrusted-client-trace' },
      user: { internalId: 1n, roles: [{ roleType: 'BUSINESS' }] },
    }
    await new AuthController(auth as any).changePassword(request as any, {
      currentPassword: 'Current-password-123!',
      newPassword: 'Next-password-123!',
    })
    expect(auth.changePassword).toHaveBeenCalledWith(1n, 'Current-password-123!', 'Next-password-123!', {
      traceId: 'server-trace',
      ip: '127.0.0.1',
      userAgent: 'test-client',
      roleTypes: ['BUSINESS'],
    })
  })
})
