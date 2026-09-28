import { describe, expect, it } from 'vitest'
import { resolveRiskDecision } from '#app/security/policies/risk-policy.js'

describe('risk policy resolution', () => {
  it('resolves risk only from the exact code-owned operation catalog', () => {
    expect(resolveRiskDecision('system.session.revoke').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.role.grant').riskLevel).toBe('L3')
    expect(() => resolveRiskDecision('system.role.grant.extra')).toThrow()
    expect(() => resolveRiskDecision('system.role.grants')).toThrow()
  })

  it('does not infer risk from permission-code prefixes or suffixes', () => {
    expect(resolveRiskDecision('system.page.read').riskLevel).toBe('L0')
    expect(resolveRiskDecision('system.page.api.options').riskLevel).toBe('L0')
    expect(resolveRiskDecision('system.page.update').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.page.enable').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.page.disable').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.page.api.bind').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.directory.create').riskLevel).toBe('L1')
    expect(resolveRiskDecision('system.directory.update').riskLevel).toBe('L1')
    expect(resolveRiskDecision('system.directory.delete').riskLevel).toBe('L1')
    expect(resolveRiskDecision('system.session.revoke').riskLevel).toBe('L2')
    expect(resolveRiskDecision('order.update').riskLevel).toBe('L2')
    for (const code of ['system.page.read.copy', 'system.user.read-any', 'order.read-all', 'unknown.resource.update'])
      expect(() => resolveRiskDecision(code)).toThrow()
  })

  it('does not require step-up for read-only user and role option views', () => {
    expect(resolveRiskDecision('system.user.read').riskLevel).toBe('L0')
    expect(resolveRiskDecision('system.user.create').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.user.update').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.role.read').riskLevel).toBe('L0')
    expect(resolveRiskDecision('system.role.options').riskLevel).toBe('L0')
    expect(resolveRiskDecision('system.role.assignment-options').riskLevel).toBe('L0')
  })

  it('uses the security-admin step-up baseline for data-scope management', () => {
    expect(resolveRiskDecision('system.data-scope.read').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.data-scope.update').riskLevel).toBe('L2')
    expect(resolveRiskDecision('system.data-scope.revoke').riskLevel).toBe('L2')
  })

  it('only raises controls when contextual risk is higher', () => {
    const decision = resolveRiskDecision('order.read', {
      fieldRiskLevels: ['L3'],
      targetRiskLevel: 'L2',
    })
    expect(decision.riskLevel).toBe('L3')
    expect(decision.requireMfa).toBe(true)
    expect(decision.requireReauth).toBe(true)
    expect(decision.requireApproval).toBe(true)
    expect(decision.auditRequired).toBe(true)
  })
})
