import { describe, expect, it } from 'vitest'
import { PAGE_PERMISSION_DOMAINS } from '../../database/page-permission-bindings.js'

describe('administrative page permission bindings', () => {
  it('binds data-scope APIs to role management', () => {
    expect(PAGE_PERMISSION_DOMAINS['page.system.role']).toContain('system.data-scope')
  })

  it('binds emergency ticket evidence and execution APIs to the ticket page', () => {
    expect(PAGE_PERMISSION_DOMAINS['page.system.ops-tickets']).toEqual(
      expect.arrayContaining([
        'system.ops-ticket',
        'system.ops-ticket.evidence',
        'system.ops-ticket.execution',
      ])
    )
  })
})
