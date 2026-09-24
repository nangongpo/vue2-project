import { describe, expect, it } from 'vitest'
// Exercise frontend selectors/serialization using the same security examples as the backend.
// @ts-ignore Frontend is intentionally plain JavaScript without declarations.
import { approvalBody, STANDARD_SCOPES } from '../../../../../frontend/src/views/system/permission/approval/utils.js'
// @ts-ignore Frontend is intentionally plain JavaScript without declarations.
import { pageApis, hasReferences, pageTree, grantChanges } from '../../../../../frontend/src/views/system/permission/utils.js'
const id = '00000000-0000-4000-8000-000000000001'
describe('frontend permission contracts', () => {
  it('does not expose ALL or CUSTOM in ordinary scope choices', () => {
    expect(STANDARD_SCOPES.map((item: any) => item.value)).not.toContain('ALL')
    expect(STANDARD_SCOPES.map((item: any) => item.value)).not.toContain('CUSTOM')
  })
  it('limits base API selectors to active reads, not GET exports or writes', () => {
    const items = [
      { id: 1, method: 'GET', status: 'ACTIVE', action: 'read' },
      { id: 2, method: 'POST', status: 'ACTIVE', action: 'create' },
      { id: 3, method: 'GET', status: 'ACTIVE', action: 'export' },
      { id: 4, method: 'GET', status: 'DISABLED', action: 'read' },
    ]
    expect(pageApis(items).map((item: any) => item.id)).toEqual([1])
  })
  it('blocks deletion if reference response is absent or incomplete', () => {
    expect(hasReferences(null)).toBe(true)
    expect(hasReferences({ functions: [], buttons: [] })).toBe(true)
    expect(hasReferences({ functions: [], buttons: [], roles: [] })).toBe(false)
  })
  it('keeps matching descendants and ancestors in page search', () => {
    const tree = pageTree(
      [
        { id: 'a', name: 'Parent', code: 'a', route: '/a' },
        { id: 'b', parentId: 'a', name: 'Child', code: 'b', route: '/a/b' },
      ],
      'Child'
    )
    expect(tree[0].children[0].id).toBe('b')
  })
  it('does not add related buttons when granting a page', () => {
    expect(grantChanges([], ['page-id'])).toEqual({ added: ['page-id'], removed: [] })
  })
  it.each(['ROLE_GRANT', 'ROLE_REVOKE'])('serializes %s with public ids only', (kind) => {
    const body = approvalBody({
      kind,
      userId: id,
      roleId: id,
      reason: ' reason ',
      expiresAt: new Date(Date.now() + 60000),
      actorId: 'forged',
    })
    expect(body.payload).toEqual({ userId: id, roleId: id })
    expect(body.actorId).toBeUndefined()
  })
  it('serializes MFA reset without accepting role or secret fields', () => {
    const body = approvalBody({
      kind: 'MFA_RESET',
      userId: id,
      roleId: id,
      mfaSecret: 'forged',
      reason: 'lost authenticator',
      expiresAt: new Date(Date.now() + 60000),
    })
    expect(body.payload).toEqual({ userId: id })
  })
  it('requires expiry and targets for CUSTOM but never sends targets for ALL', () => {
    const form = {
      kind: 'ELEVATED_SCOPE',
      roleId: id,
      reason: 'review',
      resource: 'order',
      expiresAt: new Date(Date.now() + 60000),
      scopeType: 'CUSTOM',
      targets: [],
    }
    expect(() => approvalBody(form)).toThrow()
    expect(approvalBody({ ...form, scopeType: 'ALL' }).payload.targets).toEqual([])
    expect(() => approvalBody({ ...form, scopeType: 'ALL', expiresAt: null })).toThrow()
  })
})
