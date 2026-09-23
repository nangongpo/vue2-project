import pageMetaMap from './meta'

// ========================================================
// 路由配置
// ========================================================
const ROOT_REDIRECT = '/dashboard'

const modules = import.meta.glob('/src/views/**/*.vue')

// 不放进 meta，而是放在路由节点上的字段
const ROUTE_FIELD_KEYS = new Set([
  'redirect',
  'alias',
  'props',
  'beforeEnter',
  'caseSensitive',
  'pathToRegexpOptions',
  'hidden',
  'alwaysShow'
])

// 仅供自动路由生成器使用的配置字段
const CONTROL_FIELD_KEYS = new Set([
  'name',
  'groupName',
  'layout',
  'public',
  'dynamic',
  'absoluteChildren',
  'ignore',
  'meta'
])

// ========================================================
// 基础工具
// ========================================================

function hasOwn(target, key) {
  return Object.prototype.hasOwnProperty.call(target, key)
}

function resolveValue(ownConfig, parentConfig, key, defaultValue) {
  if (hasOwn(ownConfig, key)) {
    return ownConfig[key]
  }

  if (hasOwn(parentConfig, key)) {
    return parentConfig[key]
  }

  return defaultValue
}

/**
 * 文件路径转换为路由路径。
 *
 * /src/views/dashboard.vue
 * => /dashboard
 *
 * /src/views/system/user/index.vue
 * => /system/user
 *
 * /src/views/user/[id].vue
 * => /user/:id
 *
 * /src/views/redirect/[path(.*)].vue
 * => /redirect/:path(.*)
 *
 * /src/views/redirect/[...path].vue
 * => /redirect/:path(.*)
 */
function filePathToRoutePath(filePath) {
  let routePath = filePath
    .replace(/^\/src\/views/, '')
    .replace(/\.vue$/, '')

  if (routePath === '/index') {
    routePath = '/'
  } else {
    routePath = routePath.replace(/\/index$/, '')
  }

  routePath = routePath
    .replace(/\[\.\.\.([^\]]+)\]/g, ':$1(.*)')
    .replace(/\[([^\]]+)\]/g, ':$1')

  if (/[[\]]/.test(routePath)) {
    throw new Error(
      `[auto-router] 无法解析动态路由文件：${filePath}`
    )
  }

  return routePath || '/'
}

function splitRoutePath(routePath) {
  if (routePath === '/') {
    return []
  }

  return routePath
    .replace(/^\//, '')
    .split('/')
    .filter(Boolean)
}

/**
 * 获取一级目录配置。
 *
 * /redirect/:path(.*) => /redirect
 * /system/user        => /system
 * /dashboard          => 无父级目录配置
 */
function getParentConfig(routePath) {
  const segments = splitRoutePath(routePath)

  if (segments.length <= 1) {
    return {}
  }

  return pageMetaMap[`/${segments[0]}`] || {}
}

/**
 * 生成默认路由名称。
 */
function createRouteName(routePath) {
  if (routePath === '/') {
    return 'index'
  }

  return routePath
    .replace(/^\//, '')
    .replace(
      /:([^/()]+)(\(\.\*\))?/g,
      (_, paramName, catchAll) =>
        `param-${paramName}${catchAll ? '-all' : ''}`
    )
    .replace(/[/.()*]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * 静态路径优先于动态参数，通配路由最后。
 */
function getRouteWeight(routePath) {
  if (routePath === '') return -100
  if (routePath === '*') return 1000
  if (routePath.includes('(.*)')) return 100
  if (routePath.includes(':')) return 10

  return 0
}

function sortRoutes(routes) {
  return routes.slice().sort((a, b) => {
    const weightDiff =
      getRouteWeight(a.path) - getRouteWeight(b.path)

    if (weightDiff !== 0) {
      return weightDiff
    }

    return a.path.localeCompare(b.path)
  })
}

// ========================================================
// 配置解析
// ========================================================

/**
 * 解析某个页面或目录的配置。
 *
 * layout、public、dynamic、absoluteChildren 会继承一级目录配置。
 * title、icon、hidden 等普通配置不会继承。
 */
function parseRouteConfig(routePath) {
  const ownConfig = pageMetaMap[routePath] || {}
  const parentConfig = getParentConfig(routePath)

  const isPublic = resolveValue(
    ownConfig,
    parentConfig,
    'public',
    false
  ) === true

  // public:true 默认就是常量路由
  const isDynamic = resolveValue(
    ownConfig,
    parentConfig,
    'dynamic',
    !isPublic
  ) !== false

  if (isPublic && isDynamic) {
    throw new Error(
      `[auto-router] ${routePath} 同时配置了 public:true 和 dynamic:true。` +
      '公开路由必须在应用启动时注册，请设置 dynamic:false。'
    )
  }

  const meta = {}
  const routeFields = {}

  Object.keys(ownConfig).forEach((key) => {
    if (CONTROL_FIELD_KEYS.has(key)) {
      return
    }

    if (ROUTE_FIELD_KEYS.has(key)) {
      routeFields[key] = ownConfig[key]
    } else {
      meta[key] = ownConfig[key]
    }
  })

  if (ownConfig.meta !== undefined) {
    if (
      !ownConfig.meta ||
      typeof ownConfig.meta !== 'object' ||
      Array.isArray(ownConfig.meta)
    ) {
      throw new TypeError(
        `[auto-router] ${routePath} 的 meta 必须是普通对象`
      )
    }

    Object.assign(meta, ownConfig.meta)
  }

  // 路由守卫通过 to.matched 判断是否公开
  meta.public = isPublic

  return {
    name: ownConfig.name,
    groupName: ownConfig.groupName,

    useLayout: resolveValue(
      ownConfig,
      parentConfig,
      'layout',
      true
    ) !== false,

    isPublic,
    isDynamic,

    absoluteChildren: resolveValue(
      ownConfig,
      parentConfig,
      'absoluteChildren',
      false
    ) === true,

    ignore: ownConfig.ignore === true,

    meta,
    routeFields
  }
}

// ========================================================
// 页面扫描
// ========================================================

function createPages() {
  const pathOwners = new Map()
  const nameOwners = new Map()
  const pages = []

  Object.keys(modules)
    .sort()
    .forEach((filePath) => {
      const routePath = filePathToRoutePath(filePath)
      const config = parseRouteConfig(routePath)

      if (config.ignore) {
        return
      }

      const routeName =
        config.name || createRouteName(routePath)

      if (pathOwners.has(routePath)) {
        throw new Error(
          [
            `[auto-router] 路由路径重复：${routePath}`,
            `- ${pathOwners.get(routePath)}`,
            `- ${filePath}`
          ].join('\n')
        )
      }

      if (nameOwners.has(routeName)) {
        throw new Error(
          [
            `[auto-router] 路由名称重复：${routeName}`,
            `- ${nameOwners.get(routeName)}`,
            `- ${filePath}`
          ].join('\n')
        )
      }

      pathOwners.set(routePath, filePath)
      nameOwners.set(routeName, filePath)

      pages.push({
        path: routePath,
        segments: splitRoutePath(routePath),

        useLayout: config.useLayout,
        isPublic: config.isPublic,
        isDynamic: config.isDynamic,
        absoluteChildren: config.absoluteChildren,

        route: {
          path: routePath,
          name: routeName,
          component: modules[filePath],
          meta: config.meta,
          ...config.routeFields
        }
      })
    })

  validateGroupStrategies(pages)

  return pages
}

/**
 * 同一个一级目录不能一部分在 constantRoutes，
 * 另一部分在 asyncRoutes。
 *
 * 否则 Vue Router 3 addRoutes 时会生成两个相同父路径的 Layout。
 */
function validateGroupStrategies(pages) {
  const nestedRoots = new Set(
    pages
      .filter(page => page.useLayout && page.segments.length > 1)
      .map(page => page.segments[0])
  )

  const strategyMap = new Map()

  pages.forEach((page) => {
    if (
      !page.useLayout ||
      !page.segments.length ||
      !nestedRoots.has(page.segments[0])
    ) {
      return
    }

    const rootName = page.segments[0]
    const current = strategyMap.get(rootName)

    if (current === undefined) {
      strategyMap.set(rootName, page.isDynamic)
      return
    }

    if (current !== page.isDynamic) {
      throw new Error(
        `[auto-router] /${rootName} 下不能同时存在常量路由和动态路由。` +
        `请在 pageMetaMap['/${rootName}'] 统一配置 dynamic。`
      )
    }
  })
}

// ========================================================
// Layout 路由组装
// ========================================================

function createLayoutGroup(parentPath, hasIndexPage) {
  const config = parseRouteConfig(parentPath)

  const route = {
    path: parentPath,
    component: () => import('@/layout/index.vue'),
    meta: config.meta,
    ...config.routeFields,
    children: []
  }

  /**
   * 有 /system/index.vue 时，name 应保留给具体页面，
   * 父 Layout 如需名称，使用 groupName。
   */
  const groupName =
    config.groupName ||
    (!hasIndexPage ? config.name : undefined)

  if (groupName) {
    route.name = groupName
  }

  return route
}

function getGroupChildPath(page, parentPath) {
  // /system/index.vue => path: ''
  if (page.path === parentPath) {
    return ''
  }

  // redirect 特殊路由保留完整绝对路径
  if (page.absoluteChildren) {
    return page.path
  }

  // 普通业务路由使用相对路径
  return page.segments.slice(1).join('/')
}

/**
 * 将同一类型页面组装成完整路由表。
 *
 * 传入的 pages 必须全部属于 constantRoutes，
 * 或全部属于 asyncRoutes。
 */
function buildRouteTable(pages) {
  const independentRoutes = []
  const layoutPages = []

  pages.forEach((page) => {
    if (page.useLayout) {
      layoutPages.push(page)
    } else {
      independentRoutes.push(page.route)
    }
  })

  const nestedRoots = new Set(
    layoutPages
      .filter(page => page.segments.length > 1)
      .map(page => page.segments[0])
  )

  const indexRoots = new Set(
    layoutPages
      .filter(page => page.segments.length === 1)
      .map(page => page.segments[0])
  )

  const groupMap = new Map()
  const rootLayoutChildren = []

  layoutPages.forEach((page) => {
    const firstSegment = page.segments[0]

    // src/views 根目录页面保留 / 开头
    if (
      !firstSegment ||
      !nestedRoots.has(firstSegment)
    ) {
      rootLayoutChildren.push(page.route)
      return
    }

    const parentPath = `/${firstSegment}`

    if (!groupMap.has(parentPath)) {
      groupMap.set(
        parentPath,
        createLayoutGroup(
          parentPath,
          indexRoots.has(firstSegment)
        )
      )
    }

    const group = groupMap.get(parentPath)

    group.children.push({
      ...page.route,
      path: getGroupChildPath(page, parentPath)
    })
  })

  const groupRoutes = Array.from(groupMap.values())
    .map(group => ({
      ...group,
      children: sortRoutes(group.children)
    }))

  const routes = [
    ...sortRoutes(independentRoutes),
    ...sortRoutes(groupRoutes)
  ]

  if (rootLayoutChildren.length) {
    routes.push({
      path: '/',
      component: () => import('@/layout/index.vue'),
      redirect: ROOT_REDIRECT,
      children: sortRoutes(rootLayoutChildren)
    })
  }

  return routes
}

// ========================================================
// 生成最终路由
// ========================================================

const pages = createPages()

const constantPages = pages.filter(
  page => !page.isDynamic
)

const dynamicPages = pages.filter(
  page => page.isDynamic
)

export const constantRoutes = buildRouteTable(
  constantPages
)

export const asyncRoutes = [
  ...buildRouteTable(dynamicPages),

  // Vue Router 3 通配路由必须放在最后
  {
    path: '*',
    redirect: pageMetaMap['/404']
      ? '/404'
      : '/error-page/404',
    hidden: true
  }
]

console.log('🔒 初始常量路由:', constantRoutes)
console.log('🔑 待触发动态追加路由:', asyncRoutes)

/**
 * 生成包含搜索有效菜单的权限列表
 * @returns { menuList: [], menuListGroup: {} }
 */
export function getAllMenu() {
  const menuList = []

  const menuListGroup = {
    system: []
  }
  let index = 0
  // 生成基于角色分类roleType的权限列表
  asyncRoutes.map(item => {
    if (item.meta) {
      const label = item.meta.title
      let children
      // 根路由包含ignore
      if (item.children) {
        children = item.children.reduce((t, v, i) => {
          const { title, api, buttons = [] } = v.meta || {}
          if (v.hidden) return t
          index++
          let btns = [{ label: '查看', value: v.name, api }]
          let roleType = v.meta.roleType
          if (!roleType) {
            console.error('未设置roleType: ' + JSON.stringify(v))
          } else {
            if (!menuListGroup[roleType]) {
              menuListGroup[roleType] = []
            }
            menuListGroup[roleType].push(btns[0].value)
          }
          if (buttons.length) {
            btns = buttons.reduce((t1, v1) => {
              const value = `${v.name}.${v1.value}`

              roleType = v1.roleType || v.meta.roleType
              if (!menuListGroup[roleType]) {
                menuListGroup[roleType] = []
              }
              menuListGroup[roleType].push(value)

              return [...t1, { ...v1, value, api: v1.api }]
            }, btns)
            return [...t, { label: title, value: index, children: btns }]
          }
          return [...t, { label: title, value: index, children: btns }]
        }, [])
      }
      index++
      if (item.ignore && children) {
        menuList.push(...children)
      } else {
        menuList.push({ label, value: index, children: children })
      }
    }
  })

  return {
    menuList,
    menuListGroup
  }
}
