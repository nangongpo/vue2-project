export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']

export const requiredText = (label) => [
  { required: true, whitespace: true, message: `请输入${label}`, trigger: 'blur' },
]

export function searchableText(...values) {
  return values
    .filter((value) => value !== null && value !== undefined)
    .join(' ')
    .trim()
    .toLocaleLowerCase()
}

export function activeApis(apis) {
  return apis.filter((api) => api.status === 'ACTIVE' && HTTP_METHODS.includes(api.method))
}

export function pageApis(apis) {
  return activeApis(apis).filter(
    (api) =>
      api.method === 'GET' &&
      ['read', 'list', 'detail', 'init', 'options', 'references'].includes(api.action)
  )
}

export function boundApis(resource) {
  return (resource?.apis || []).map((item) => item?.api || item).filter(Boolean)
}

export function selectableIds(ids, options) {
  const allowed = new Set(options.map((item) => item.id))
  return [...new Set(ids)].filter((id) => allowed.has(id))
}

export function descendantIds(pages, id) {
  const ids = new Set(id ? [id] : [])
  let changed = true
  while (changed) {
    changed = false
    pages.forEach((page) => {
      if (ids.has(page.parentId) && !ids.has(page.id)) {
        ids.add(page.id)
        changed = true
      }
    })
  }
  return ids
}

export function pageTree(pages, keyword = '') {
  const nodes = new Map(pages.map((page) => [page.id, { ...page, children: [] }]))
  const roots = []
  nodes.forEach((node) => {
    const visited = new Set([node.id])
    let parent = nodes.get(node.parentId)
    while (parent && !visited.has(parent.id)) {
      visited.add(parent.id)
      parent = nodes.get(parent.parentId)
    }
    if (parent || !nodes.has(node.parentId)) roots.push(node)
    else nodes.get(node.parentId).children.push(node)
  })
  const search = searchableText(keyword)
  const filter = (items) =>
    items
      .sort((a, b) => (a.sort || 0) - (b.sort || 0) || a.name.localeCompare(b.name))
      .map((item) => ({ ...item, children: filter(item.children) }))
      .filter(
        (item) =>
          !search ||
          item.children.length ||
          searchableText(item.name, item.code, item.route, item.permission?.name).includes(search)
      )
  return filter(roots)
}

export function hasReferences(references) {
  return ['functions', 'buttons', 'roles'].some(
    (key) => !Array.isArray(references?.[key]) || references[key].length > 0
  )
}

export function grantChanges(previous, next) {
  return {
    added: next.filter((id) => !previous.includes(id)),
    removed: previous.filter((id) => !next.includes(id)),
  }
}

export async function requestReason(vm, title, message) {
  try {
    const { value } = await vm.$prompt(message, title, {
      type: 'warning',
      inputType: 'textarea',
      inputValidator: (value) =>
        (typeof value === 'string' && !!value.trim() && value.trim().length <= 255) ||
        '请填写操作原因，最多 255 个字符',
      confirmButtonText: '确认执行',
      cancelButtonText: '取消',
      closeOnClickModal: false,
    })
    return value.trim()
  } catch {
    return null
  }
}
