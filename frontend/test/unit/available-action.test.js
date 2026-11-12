import { describe, expect, it } from 'vitest'
import { availableActionLabel, findAvailableAction, hasAvailableAction } from '../../src/utils/available-action.js'

describe('available action contract', () => {
  it('supports the backend string and object action formats', () => {
    const row = { availableActions: ['file.read', { code: 'file.delete', label: '删除' }] }

    expect(findAvailableAction(row, 'file.read')).toBe('file.read')
    expect(hasAvailableAction(row, 'file.delete')).toBe(true)
    expect(availableActionLabel(row, 'file.delete')).toBe('删除')
  })

  it('fails closed when action data is absent or malformed', () => {
    expect(findAvailableAction({}, 'file.read')).toBeNull()
    expect(hasAvailableAction({ availableActions: [null] }, 'file.read')).toBe(false)
    expect(availableActionLabel({}, 'file.read')).toBe('—')
  })
})
