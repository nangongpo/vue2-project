import { describe, expect, it } from 'vitest'
import { PAGE_PERMISSION_BINDINGS, type SeedPageCode } from '#app/database/page-permission-bindings.js'
import { allApiDefinitions } from '#app/security/policies/permission-catalog/index.js'

describe('seeded page permission bindings', () => {
  it('declares every seeded page and directory explicitly', () => {
    const seededPages: SeedPageCode[] = [
      'system',
      'business',
      'page.system.user',
      'page.system.role',
      'page.system.permission',
      'page.system.api',
      'page.system.approval',
      'page.system.audit',
      'page.system.health',
      'page.system.ops-tickets',
      'page.business.order-manage',
    ]
    expect(Object.keys(PAGE_PERMISSION_BINDINGS).sort()).toEqual([...seededPages].sort())
  })

  it('allows only GET APIs as page initialization bindings', () => {
    const apiByCode = new Map(allApiDefinitions().map((api) => [api.code, api]))
    for (const [pageCode, bindings] of Object.entries(PAGE_PERMISSION_BINDINGS)) {
      for (const binding of bindings.filter((item) => item.type === 'PAGE_API')) {
        const api = apiByCode.get(binding.apiCode)
        expect(api, `${pageCode} -> ${binding.apiCode}`).toBeDefined()
        expect(api?.method, `${pageCode} -> ${binding.apiCode}`).toBe('GET')
      }
    }
  })

  it('keeps high-impact APIs out of page initialization bindings', () => {
    const pageApiCodes = Object.values(PAGE_PERMISSION_BINDINGS)
      .flat()
      .filter((binding) => binding.type === 'PAGE_API')
      .map((binding) => binding.apiCode)
    expect(pageApiCodes).not.toContain('system.role.grant')
    expect(pageApiCodes).not.toContain('system.data-scope.update')
    expect(pageApiCodes).not.toContain('system.audit.export')
    expect(pageApiCodes).not.toContain('order.create')
  })

  it('binds business order management only to its read API', () => {
    expect(PAGE_PERMISSION_BINDINGS['page.business.order-manage']).toEqual([
      { type: 'PAGE_API', apiCode: 'order.read' },
    ])
  })

  it('binds role management data-scope reads explicitly', () => {
    expect(PAGE_PERMISSION_BINDINGS['page.system.role']).toContainEqual({
      type: 'PAGE_API',
      apiCode: 'system.data-scope.read',
    })
  })

  it('binds button action options to permission management page initialization', () => {
    expect(PAGE_PERMISSION_BINDINGS['page.system.permission']).toContainEqual({
      type: 'PAGE_API',
      apiCode: 'system.button.options',
    })
  })
})
