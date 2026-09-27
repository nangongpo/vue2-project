import { constantRoutes, asyncRoutes } from '@/router/auto-router'

function routePath(route) {
  return route.meta && route.meta.routePath
}

function canEnter(navigationPaths, route) {
  if (route.children && route.children.length) {
    return route.children.some((child) => canEnter(navigationPaths, child))
  }
  if (route.hidden) {
    const path = routePath(route)
    return !path || navigationPaths.some((item) => path === item || path.startsWith(item + '/'))
  }
  return navigationPaths.includes(routePath(route))
}

function applyNavigation(route, navigationMap) {
  const item = navigationMap.get(routePath(route))
  if (!item) return route
  const meta = { ...route.meta, title: item.title }
  if (item.icon) meta.icon = item.icon
  const next = { ...route, meta }
  if (item.props !== null && item.props !== undefined) next.props = item.props
  return next
}

function sortByNavigation(routes, navigation) {
  if (!navigation.length) return routes
  const order = new Map(navigation.map((item, index) => [item.path, index]))
  return routes
    .map((route, index) => ({ route, index }))
    .sort((a, b) => {
      const aOrder = order.get(routePath(a.route))
      const bOrder = order.get(routePath(b.route))
      if (aOrder === undefined && bOrder === undefined) return a.index - b.index
      if (aOrder === undefined) return 1
      if (bOrder === undefined) return -1
      return aOrder - bOrder || a.index - b.index
    })
    .map(({ route }) => route)
}

export function filterAsyncRoutes(routes, navigation = []) {
  const navigationPaths = navigation.map((item) => item.path)
  const navigationMap = new Map(navigation.map((item) => [item.path, item]))
  const filtered = []

  routes.forEach((route) => {
    const current = applyNavigation({ ...route }, navigationMap)
    if (!canEnter(navigationPaths, current)) return
    if (current.children) current.children = filterAsyncRoutes(current.children, navigation)
    filtered.push(current)
  })

  return sortByNavigation(filtered, navigation)
}

const state = {
  routes: [],
  addRoutes: [],
}

const mutations = {
  SET_ROUTES: (state, routes) => {
    state.addRoutes = routes
    state.routes = constantRoutes.concat(routes)
  },
}

const actions = {
  generateRoutes({ commit }, { navigation = [] }) {
    const accessedRoutes = filterAsyncRoutes(asyncRoutes, navigation)
    commit('SET_ROUTES', accessedRoutes)
    return Promise.resolve(accessedRoutes)
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
}
