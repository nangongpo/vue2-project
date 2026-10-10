export function findAvailableAction(row, code) {
  const actions = Array.isArray(row?.availableActions) ? row.availableActions : []
  return actions.find((item) => (typeof item === 'string' ? item : item?.code) === code) || null
}

export function hasAvailableAction(row, code) {
  return !!findAvailableAction(row, code)
}

export function availableActionLabel(row, code) {
  const action = findAvailableAction(row, code)
  return typeof action === 'object' && action?.label ? action.label : '—'
}
