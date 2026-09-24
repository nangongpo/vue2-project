import { describe, expect, it } from 'vitest'
import { effectivePermissions } from '../services/effective-permissions.js'

type Grant = Parameters<typeof effectivePermissions>[0][number]
const grant = (id: string, type: string, extra: Partial<Grant> = {}): Grant => ({
  id,
  code: `orders.${id}`,
  type,
  status: 'ACTIVE',
  method: type === 'API' ? 'GET' : null,
  path: type === 'API' ? `/api/v1/orders/${id}` : null,
  requiredRoleType: 'BUSINESS',
  ...extra,
})
const grants = [
  grant('root', 'PAGE'),
  grant('page', 'PAGE'),
  grant('button', 'BUTTON'),
  grant('read', 'API'),
  grant('write', 'API', { method: 'POST' }),
]
const pages = [
  { id: 'root-page', parentId: null, permissionId: 'root', status: 'ACTIVE' },
  { id: 'orders-page', parentId: 'root-page', permissionId: 'page', status: 'ACTIVE' },
]
const buttons = [{ id: 'save-button', functionId: 'orders-page', permissionId: 'button', status: 'ACTIVE' }]
const pageApis = [{ functionId: 'orders-page', apiId: 'read' }]
const buttonApis = [{ buttonId: 'save-button', apiId: 'write' }]
const resolve = (selected = grants, pageRows = pages, buttonRows = buttons) =>
  effectivePermissions(selected, pageRows, buttonRows, pageApis, buttonApis).map((p) => p.id)

describe('effectivePermissions', () => {
  it('defaults to no permissions without explicit grants', () => {
    expect(resolve([])).toEqual([])
  })

  it('a page grant manufactures neither button nor API grants from bindings', () => {
    expect(resolve(grants.filter((p) => p.type === 'PAGE'))).toEqual(['root', 'page'])
  })

  it('explicit page and read API grants do not imply write access', () => {
    expect(resolve(grants.filter((p) => ['root', 'page', 'read', 'write'].includes(p.id)))).toEqual(['root', 'page', 'read'])
  })

  it('a button grant still requires an explicit API grant', () => {
    expect(resolve(grants.filter((p) => p.type !== 'API'))).toEqual(['root', 'page', 'button'])
  })

  it('allows independently granted read and write APIs with their active bindings', () => {
    expect(resolve()).toEqual(['root', 'page', 'button', 'read', 'write'])
  })

  it('supports explicitly granted standalone APIs without a page binding', () => {
    expect(resolve([grant('standalone', 'API')])).toEqual(['standalone'])
  })

  it.each(['root', 'page'])('missing ancestor grant %s blocks all descendants and their APIs', (id) => {
    expect(resolve(grants.filter((p) => p.id !== id))).toEqual(id === 'root' ? [] : ['root'])
  })

  it.each(['root-page', 'orders-page'])('disabled page %s blocks its descendants despite active permission records', (id) => {
    expect(
      resolve(
        grants,
        pages.map((p) => (p.id === id ? { ...p, status: 'DISABLED' } : p))
      )
    ).toEqual(id === 'root-page' ? [] : ['root'])
  })

  it.each(['root', 'page', 'button', 'read', 'write'])('disabled explicit permission %s is never effective', (id) => {
    const effective = resolve(grants.map((p) => (p.id === id ? { ...p, status: 'DISABLED' } : p)))
    expect(effective).not.toContain(id)
    if (id === 'root' || id === 'page') {
      for (const descendant of ['button', 'read', 'write']) expect(effective).not.toContain(descendant)
    }
    if (id === 'button') expect(effective).not.toContain('write')
  })

  it('disabled buttons block writes but preserve separately granted page reads', () => {
    expect(
      resolve(
        grants,
        pages,
        buttons.map((b) => ({ ...b, status: 'DISABLED' }))
      )
    ).toEqual(['root', 'page', 'read'])
  })

  it('missing parents and cyclic parent chains fail closed', () => {
    expect(
      resolve(
        grants,
        pages.map((p) => (p.id === 'root-page' ? { ...p, parentId: 'missing' } : p))
      )
    ).toEqual([])
    expect(
      resolve(
        grants,
        pages.map((p) => (p.id === 'root-page' ? { ...p, parentId: 'orders-page' } : p))
      )
    ).toEqual([])
  })

  it('orphan page and button grants cannot manufacture access', () => {
    expect(resolve(grants, [], [])).toEqual([])
  })

  it('retired wildcard and monolithic permissions never become effective', () => {
    expect(resolve([grant('wildcard', 'API', { code: '*' }), grant('legacy', 'MANAGEMENT', { code: 'system.permission.manage' })])).toEqual(
      []
    )
  })

  it('rejects unknown resource types and incomplete API grants', () => {
    expect(
      resolve([grant('unknown', 'UNKNOWN'), grant('methodless', 'API', { method: null }), grant('pathless', 'API', { path: null })])
    ).toEqual([])
  })
})
