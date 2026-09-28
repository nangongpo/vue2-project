import { describe, expect, it } from 'vitest'
import { RoleType } from '#app/common/types/prisma-enums.js'
import {
  allApiDefinitions,
  BUSINESS_APIS,
  DATA_FIELD_ROLE_POLICIES,
  MANAGEMENT_PERMISSION_ROLE_POLICIES,
  PAGE_PERMISSION_ROLE_POLICIES,
  SYSTEM_APIS,
  matchesPermissionTarget,
  roleAllowsPermission,
} from '#app/security/policies/permission-catalog/index.js'
import { OPERATION_ACTION_OPTIONS } from '#app/security/policies/permission-catalog/operation-actions.js'

describe('permission catalog route contracts', () => {
  it('exposes the standard operation action directory separately from API permissions', () => {
    expect(OPERATION_ACTION_OPTIONS.map((item) => item.value)).toEqual([
      'read', 'detail', 'options', 'create', 'update', 'enable', 'disable', 'unlock',
      'delete', 'bind', 'grant', 'revoke', 'submit', 'approve', 'execute', 'review',
      'cancel', 'export', 'verify',
    ])
    expect(OPERATION_ACTION_OPTIONS.every((item) => item.description.length > 0)).toBe(true)
    expect(SYSTEM_APIS).toContainEqual(expect.objectContaining({
      code: 'system.button.options',
      method: 'GET',
      path: '/api/v1/permission/buttons/action-options',
      resource: 'system.button',
      action: 'options',
    }))
  })

  it('registers page API options as a distinct read-only permission', () => {
    expect(SYSTEM_APIS.some((entry) => entry.code === 'system.role.grants.read')).toBe(true)
    expect(BUSINESS_APIS.some((entry) => entry.code === 'order.read')).toBe(true)
    expect(SYSTEM_APIS.some((entry) => entry.code === 'order.read')).toBe(false)
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.page.api.options',
        method: 'GET',
        path: '/api/v1/permission/pages/base-apis/options',
        resource: 'system.page.api',
        action: 'options',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.api.options',
        method: 'GET',
        path: '/api/v1/permission/api-options',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.approval.target-options',
        method: 'GET',
        path: '/api/v1/permission/approvals/target-options',
      })
    )
  })

  it('uses explicit enable and disable permissions for managed status changes', () => {
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.button.enable',
        method: 'PATCH',
        path: '/api/v1/permission/buttons/:id/enable',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.button.disable',
        method: 'PATCH',
        path: '/api/v1/permission/buttons/:id/disable',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.field.enable',
        method: 'PATCH',
        path: '/api/v1/permission/fields/:id/enable',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.field.disable',
        method: 'PATCH',
        path: '/api/v1/permission/fields/:id/disable',
      })
    )
    expect(allApiDefinitions()).not.toContainEqual(expect.objectContaining({ code: 'system.button.status' }))
    expect(allApiDefinitions()).not.toContainEqual(expect.objectContaining({ code: 'system.field.status' }))
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.data-resource.enable',
        method: 'PATCH',
        path: '/api/v1/permission/data-resources/:id/enable',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.data-resource.disable',
        method: 'PATCH',
        path: '/api/v1/permission/data-resources/:id/disable',
      })
    )
    expect(allApiDefinitions()).not.toContainEqual(
      expect.objectContaining({ code: 'system.data-resource.status' })
    )
  })

  it('supports explicit resource/action declarations for nested API codes', () => {
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.role.grants.read',
        resource: 'system.role',
        action: 'grants.read',
      })
    )
    expect(matchesPermissionTarget(
      { resource: 'system.role', action: 'grants.read' },
      { resource: 'system.role', action: 'grants.read' },
    )).toBe(true)
    expect(matchesPermissionTarget(
      { resource: 'system.role.grants', action: 'read' },
      { resource: 'system.role', action: 'grants.read' },
    )).toBe(false)
  })

  it('stores Chinese display names separately from stable API permission codes', () => {
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({ code: 'system.audit.read', name: '查询审计日志' })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({ code: 'system.role.grant', name: '配置角色权限' })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({ code: 'order.create', name: '创建订单' })
    )
  })

  it('registers directory creation separately from page creation', () => {
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.directory.create',
        method: 'POST',
        path: '/api/v1/permission/directories',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.directory.update',
        method: 'PATCH',
        path: '/api/v1/permission/directories/:id',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.directory.delete',
        method: 'DELETE',
        path: '/api/v1/permission/directories/:id',
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.page.delete',
        method: 'DELETE',
        path: '/api/v1/permission/pages/:id',
      })
    )
    expect(allApiDefinitions()).not.toContainEqual(
      expect.objectContaining({
        code: 'system.directory.create',
        path: '/api/v1/permission/pages',
      })
    )
  })

  it('does not have duplicate method and route entries', () => {
    const keys = allApiDefinitions().map((api) => `${api.method} ${api.path}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('keeps the four role categories inside their declared responsibility boundaries', () => {
    expect(PAGE_PERMISSION_ROLE_POLICIES['page.system.approval']).toEqual({
      type: 'ROLE_ALLOWLIST',
      roleTypes: ['SECURITY', 'AUDIT'],
    })
    expect(PAGE_PERMISSION_ROLE_POLICIES['page.system.ops-tickets']).toEqual({
      type: 'ROLE_ALLOWLIST',
      roleTypes: ['SECURITY', 'SYSTEM', 'AUDIT'],
    })
    expect(DATA_FIELD_ROLE_POLICIES).toMatchObject({
      'system.audit': ['AUDIT'],
      'system.approval': ['SECURITY', 'AUDIT'],
    })
    expect(MANAGEMENT_PERMISSION_ROLE_POLICIES['system.audit.review']).toEqual({
      type: 'SINGLE_ROLE',
      roleType: 'AUDIT',
    })

    const cases: Array<[string, readonly RoleType[]]> = [
      ['system.audit.read', ['AUDIT']],
      ['system.audit.export', ['AUDIT']],
      ['system.approval.read', ['SECURITY', 'AUDIT']],
      ['system.approval.detail', ['SECURITY', 'AUDIT']],
      ['system.approval.review', ['AUDIT']],
      ['system.ops-ticket.read', ['SECURITY', 'SYSTEM', 'AUDIT']],
      ['system.ops-ticket.execute', ['SECURITY', 'SYSTEM']],
      ['system.health.read', ['SYSTEM']],
      ['system.role.grant', ['SECURITY']],
      ['system.audit.field.action.read', ['AUDIT']],
      ['system.approval.field.kind.read', ['SECURITY', 'AUDIT']],
      ['system.user.field.username.read', ['SECURITY', 'SYSTEM']],
    ] as const

    for (const [code, allowed] of cases) {
      for (const role of ['BUSINESS', 'SECURITY', 'SYSTEM', 'AUDIT'] as const) {
        expect(roleAllowsPermission(role, { code, type: code.includes('.field.') ? 'FIELD' : undefined })).toBe(
          allowed.includes(role)
        )
      }
    }
  })

  it('uses loaded role-type relations for field permissions, including empty relations', () => {
    expect(
      roleAllowsPermission('AUDIT', {
        code: 'system.user.field.username.read',
        type: 'FIELD',
        roleTypes: [{ roleType: 'AUDIT' }],
      })
    ).toBe(true)
    expect(
      roleAllowsPermission('SECURITY', {
        code: 'system.user.field.username.read',
        type: 'FIELD',
        roleTypes: [],
      })
    ).toBe(false)
  })

  it('declares read access roles in the catalog instead of a permission-code branch', () => {
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.ops-ticket.read',
        rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM', 'AUDIT'] },
      })
    )
    expect(allApiDefinitions()).toContainEqual(
      expect.objectContaining({
        code: 'system.ops-ticket.detail',
        rolePolicy: { type: 'ROLE_ALLOWLIST', roleTypes: ['SECURITY', 'SYSTEM', 'AUDIT'] },
      })
    )
  })
})
