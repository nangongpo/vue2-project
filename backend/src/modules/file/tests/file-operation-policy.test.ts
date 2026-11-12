import { describe, expect, it } from 'vitest'
import { fileOperationRisk, type FileOperationKind } from '#app/modules/file/file-operation-policy.js'
import { resolveRiskDecision } from '#app/security/policies/risk-policy.js'

const ready = { status: 'READY', scanStatus: 'CLEAN', securityHold: null, retentionLocked: false }
describe('file operation risk by target', () => {
  it.each(['FILE_DELETE', 'FILE_REJECT', 'FILE_RESCAN'] as FileOperationKind[])('uses L2 for unbound %s', (kind) => {
    expect(fileOperationRisk(kind, ready, 0)).toMatchObject({ riskLevel: 'L2', requireApproval: false, requireMfa: true })
  })
  it.each(['FILE_DELETE', 'FILE_REJECT', 'FILE_RESCAN'] as FileOperationKind[])('requires approval for a bound available file: %s', (kind) => {
    expect(fileOperationRisk(kind, ready, 1)).toMatchObject({ riskLevel: 'L3', requireApproval: true })
  })
  it('does not require approval to soft-delete an unbound infected file', () => {
    expect(fileOperationRisk('FILE_DELETE', { ...ready, status: 'REJECTED', scanStatus: 'INFECTED', securityHold: 'MALWARE' }, 0).riskLevel).toBe('L2')
  })
  it.each(['FILE_RESCAN', 'FILE_RESTORE'] as FileOperationKind[])('never lowers a security release to L2: %s', (kind) => {
    expect(fileOperationRisk(kind, { ...ready, status: kind === 'FILE_RESTORE' ? 'DELETED' : 'REJECTED', securityHold: 'MANUAL' }, 0)).toMatchObject({ riskLevel: 'L3', requireDualControl: true })
  })
  it('only allows normal proven unbound restore at L2', () => {
    expect(fileOperationRisk('FILE_RESTORE', { ...ready, status: 'DELETED', deletedFromStatus: 'READY' }, 0).riskLevel).toBe('L2')
    expect(fileOperationRisk('FILE_RESTORE', { ...ready, status: 'DELETED' }, 0).riskLevel).toBe('L3')
  })
  it('rejects retention deletion even at configured L3', () => {
    expect(() => fileOperationRisk('FILE_DELETE', { ...ready, retentionLocked: true }, 0)).toThrow('禁止删除')
  })
  it('keeps stricter organization policies', () => {
    const policy = resolveRiskDecision('system.file.admin.delete', { minimumLevel: 'L3' })
    expect(fileOperationRisk('FILE_DELETE', ready, 0, policy)).toMatchObject({ riskLevel: 'L3', requireApproval: true })
  })
})
