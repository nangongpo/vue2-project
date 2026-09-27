import { describe, expect, it } from 'vitest'
import { riskLevelForOperation, riskLevelForPermission } from '../policies/risk-policy.js'

describe('risk policy resolution', () => {
  it('prefers the explicit operation catalog over fallback rules', () => {
    expect(riskLevelForOperation('system.session.revoke')).toBe('L2')
    expect(riskLevelForOperation('system.role.grant')).toBe('L3')
  })

  it('uses readable declaration rules for permission-code fallback', () => {
    expect(riskLevelForPermission('system.page.read')).toBe('L0')
    expect(riskLevelForPermission('system.page.api.options')).toBe('L0')
    expect(riskLevelForPermission('system.page.update')).toBe('L3')
    expect(riskLevelForPermission('system.page.enable')).toBe('L2')
    expect(riskLevelForPermission('system.page.disable')).toBe('L2')
    expect(riskLevelForPermission('system.page.api.bind')).toBe('L2')
    expect(riskLevelForPermission('system.directory.create')).toBe('L1')
    expect(riskLevelForPermission('system.directory.update')).toBe('L1')
    expect(riskLevelForPermission('system.directory.delete')).toBe('L1')
    expect(riskLevelForPermission('system.session.list')).toBe('L0')
    expect(riskLevelForPermission('system.session.revoke')).toBe('L2')
    expect(riskLevelForPermission('order.update')).toBe('L1')
  })

  it('does not require step-up for read-only user and role option views', () => {
    expect(riskLevelForPermission('system.user.read')).toBe('L0')
    expect(riskLevelForPermission('system.user.create')).toBe('L2')
    expect(riskLevelForPermission('system.user.update')).toBe('L2')
    expect(riskLevelForPermission('system.role.read')).toBe('L0')
    expect(riskLevelForPermission('system.role.options')).toBe('L0')
    expect(riskLevelForPermission('system.role.assignment-options')).toBe('L0')
  })

  it('uses the security-admin step-up baseline for data-scope management', () => {
    expect(riskLevelForOperation('data-scope.read')).toBe('L2')
    expect(riskLevelForOperation('data-scope.update')).toBe('L2')
    expect(riskLevelForOperation('data-scope.revoke')).toBe('L2')
    expect(riskLevelForPermission('system.data-scope.read')).toBe('L2')
    expect(riskLevelForPermission('system.data-scope.update')).toBe('L2')
    expect(riskLevelForPermission('system.data-scope.revoke')).toBe('L2')
  })
})
