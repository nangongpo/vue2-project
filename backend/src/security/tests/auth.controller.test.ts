import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { AuthController } from '../controllers/auth.controller.js'

describe('AuthController password audit context', () => {
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
