import { describe, expect, it, vi } from 'vitest'
import { ForbiddenException } from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { lastValueFrom, of } from 'rxjs'
import { DataFieldSecurityInterceptor } from '#app/common/interceptors/data-field-security.interceptor.js'
import { PrismaService } from '#app/database/prisma.service.js'

type Field = {
  field: string
  dataType: string
  relationResource?: string | null
  relationModel?: string | null
  relationField?: string | null
  status: 'ACTIVE'
  riskLevel: 'L1' | 'L2' | 'L3'
  readPermission: { code: string }
  writePermission?: { code: string } | null
}

const field = (
  resource: string,
  name: string,
  options: Partial<Pick<Field, 'relationResource' | 'relationModel' | 'relationField' | 'writePermission'>> = {}
): Field => ({
  field: name,
  dataType: 'string',
  status: 'ACTIVE',
  riskLevel: 'L1',
  readPermission: { code: `${resource}.field.${name}.read` },
  ...options,
})

function context(request: Record<string, unknown>) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext
}

describe('DataFieldSecurityInterceptor field contracts', () => {
  it('projects the public camelCase fields and nested role relation', async () => {
    const findMany = vi.fn(({ where }: { where: { resource: string } }) => {
      const definitions: Record<string, Field[]> = {
        'system.user': [
          field('system.user', 'userId'),
          field('system.user', 'displayName'),
          field('system.user', 'roles', {
            relationResource: 'system.role',
            relationModel: 'Role',
            relationField: 'role',
          }),
        ],
        'system.role': [field('system.role', 'roleId'), field('system.role', 'name')],
      }
      return Promise.resolve(definitions[where.resource] || [])
    })
    const interceptor = new DataFieldSecurityInterceptor(
      { getAllAndOverride: vi.fn().mockReturnValue('system.user') } as unknown as Reflector,
      { permissionField: { findMany } } as unknown as PrismaService
    )
    const value = {
      code: '000000',
      message: 'success',
      data: {
        items: [
          {
            userId: 'user-1',
            displayName: 'Alice',
            display_name: 'wrong-field',
            roles: [{ role: { roleId: 'role-1', name: '业务角色', role_name: 'wrong-field' } }],
          },
        ],
      },
    }

    const result = await lastValueFrom(
      interceptor.intercept(
        context({
          method: 'GET',
          user: {
            permissions: [
              'system.user.field.userId.read',
              'system.user.field.displayName.read',
              'system.user.field.roles.read',
              'system.role.field.roleId.read',
              'system.role.field.name.read',
            ],
          },
        }),
        { handle: () => of(value) }
      )
    )

    expect(result).toEqual({
      code: '000000',
      message: 'success',
      data: {
        items: [
          {
            userId: 'user-1',
            displayName: 'Alice',
            roles: [{ role: { roleId: 'role-1', name: '业务角色' } }],
          },
        ],
      },
    })
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { resource: 'system.user', status: 'ACTIVE' } })
    )
    expect(findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { resource: 'system.role', status: 'ACTIVE' } })
    )
  })

  it('accepts the API camelCase write field and rejects a snake_case alias', async () => {
    const findMany = vi.fn().mockResolvedValue([
      field('system.user', 'displayName', {
        writePermission: { code: 'system.user.field.displayName.write' },
      }),
    ])
    const interceptor = new DataFieldSecurityInterceptor(
      { getAllAndOverride: vi.fn().mockReturnValue('system.user') } as unknown as Reflector,
      { permissionField: { findMany } } as unknown as PrismaService
    )
    const next = { handle: vi.fn(() => of({ code: '000000', data: { displayName: 'Alice' } })) }
    const request = {
      method: 'PATCH',
      body: { displayName: 'Alice' },
      user: { permissions: ['system.user.field.displayName.write'] },
    }

    await lastValueFrom(interceptor.intercept(context(request), next))
    expect(next.handle).toHaveBeenCalledOnce()
    expect(request).toMatchObject({ fieldRiskLevel: 'L1', riskLevel: 'L1' })

    await expect(
      lastValueFrom(
        interceptor.intercept(context({ ...request, body: { display_name: 'Alice' } }), {
          handle: vi.fn(() => of({ code: '000000', data: {} })),
        })
      )
    ).rejects.toBeInstanceOf(ForbiddenException)
  })
})
