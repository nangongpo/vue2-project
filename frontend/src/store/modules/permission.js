import { constantRoutes, asyncRoutes } from '@/router/auto-router'

/**
 * Use meta.role to determine if the current user has permission
 * @param roles
 * @param route
 */
function hasPermission(menu_list, route) {
  if (menu_list.includes('*')) return true
  if (route.children && route.children.length) {
    const childrenName = route.children.filter((v) => hasPermission(menu_list, v))
    return childrenName.length > 0
  } else {
    return (
      route.meta?.authenticatedOnly === true ||
      (route.meta && route.meta.permission && menu_list.includes(route.meta.permission)) ||
      route.hidden
    )
  }
}

/**
 * Filter asynchronous routing tables by recursion
 * @param routes asyncRoutes
 * @param roles
 */
export function filterAsyncRoutes(routes, menu_list) {
  const res = []

  routes.forEach((route) => {
    const tmp = { ...route }
    if (hasPermission(menu_list, tmp)) {
      if (tmp.children) {
        tmp.children = filterAsyncRoutes(tmp.children, menu_list)
      }
      res.push(tmp)
    }
  })

  return res
  // 去除权限的限制
  // return routes
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
  generateRoutes({ commit }, menu_list) {
    return new Promise((resolve) => {
      const accessedRoutes = filterAsyncRoutes(asyncRoutes, menu_list)

      commit('SET_ROUTES', accessedRoutes)
      resolve(accessedRoutes)
    })
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
}
