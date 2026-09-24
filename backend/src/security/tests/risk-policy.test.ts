import { describe, expect, it } from 'vitest'
import { riskLevelForOperation, riskLevelForPermission } from '../policies/risk-policy.js'

describe('risk policy resolution', () => {
  it('prefers the explicit operation catalog over fallback rules', () => {
    expect(riskLevelForOperation('system.session.revoke')).toBe('L2')
    expect(riskLevelForOperation('system.role.grant')).toBe('L3')
  })

  it('uses readable declaration rules for permission-code fallback', () => {
    expect(riskLevelForPermission('system.page.read')).toBe('L0')
    expect(riskLevelForPermission('system.page.update')).toBe('L3')
    expect(riskLevelForPermission('system.session.list')).toBe('L0')
    expect(riskLevelForPermission('system.session.revoke')).toBe('L2')
    expect(riskLevelForPermission('order.update')).toBe('L1')
  })
})
