type Page = { id: string; parentId: string | null; permissionId: string | null; status: string }
type Button = { id: string; functionId: string; permissionId: string | null; status: string }
type Grant = {
  id: string
  code: string
  type: string
  status: string
  method: string | null
  path: string | null
  requiredRoleType: string
}

/** Explicit grants are prerequisites; bindings never manufacture grants. */
export function effectivePermissions(
  grants: Grant[],
  pages: Page[],
  buttons: Button[],
  pageApis: Array<{ functionId: string; apiId: string }>,
  buttonApis: Array<{ buttonId: string; apiId: string }>
) {
  const active = grants.filter(
    (p) => p.status === 'ACTIVE' && !['*', 'system.permission.manage'].includes(p.code)
  )
  const granted = new Set(active.map((p) => p.id))
  const pageMap = new Map(pages.map((p) => [p.id, p]))
  function pageAllowed(id: string): boolean {
    const visited = new Set<string>()
    let cursor: string | null = id
    while (cursor) {
      if (visited.has(cursor)) return false
      visited.add(cursor)
      const page: Page | undefined = pageMap.get(cursor)
      if (
        !page ||
        page.status !== 'ACTIVE' ||
        !page.permissionId ||
        !granted.has(page.permissionId)
      )
        return false
      cursor = page.parentId
    }
    return true
  }
  const allowedPages = new Set(pages.filter((p) => pageAllowed(p.id)).map((p) => p.id))
  const allowedButtons = new Set(
    buttons
      .filter(
        (b) =>
          b.status === 'ACTIVE' &&
          b.permissionId &&
          granted.has(b.permissionId) &&
          allowedPages.has(b.functionId)
      )
      .map((b) => b.id)
  )
  return active.filter((p) => {
    if (p.type === 'MANAGEMENT' || p.type === 'FIELD') return true
    if (p.type === 'PAGE')
      return pages.some((page) => page.permissionId === p.id && allowedPages.has(page.id))
    if (p.type === 'BUTTON')
      return buttons.some((button) => button.permissionId === p.id && allowedButtons.has(button.id))
    if (p.type !== 'API' || !p.method || !p.path) return false
    const parents = pageApis.filter((edge) => edge.apiId === p.id)
    const operations = buttonApis.filter((edge) => edge.apiId === p.id)
    if (!parents.length && !operations.length) return true
    return (
      parents.some((edge) => allowedPages.has(edge.functionId)) ||
      operations.some((edge) => allowedButtons.has(edge.buttonId))
    )
  })
}
