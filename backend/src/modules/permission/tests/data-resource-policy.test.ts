import { describe, expect, it } from 'vitest'
import { isBusinessDataResource } from '#app/modules/permission/policies/data-resource-policy.js'

describe('data-resource-policy', () => {
  it('accepts only resources explicitly registered by the business API catalog', () => {
    expect(isBusinessDataResource('order')).toBe(true)
  })

  it.each(['customer', 'foo.bar', 'system.user', 'page.business.order-manage', ''])(
    'rejects an unregistered or management resource: %s',
    (resource) => {
      expect(isBusinessDataResource(resource)).toBe(false)
    }
  )
})
