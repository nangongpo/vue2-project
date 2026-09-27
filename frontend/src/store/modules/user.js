import { completeLogin, login, getInfo as fetchUserInfo, logout } from '@/api/user'
import { resetRouter } from '@/router'

const state = {
  menu_list: [],
  user_info: {},
  // Kept as an empty compatibility object for shared form components.
  all_options: {},
  login_info_pending: false,
  authenticated: false,
}

const mutations = {
  SET_USER_INFO: (state, user_info) => {
    state.user_info = user_info
    state.authenticated = !!user_info.userId
  },
  SET_LOGIN_INFO_PENDING: (state, pending) => {
    state.login_info_pending = pending
  },
  SET_MENU_LIST: (state, menu_list) => {
    state.menu_list = menu_list
  },
}

const actions = {
  // user login
  login({ commit }, userInfo) {
    return login(userInfo).then(() => {
      commit('SET_LOGIN_INFO_PENDING', true)
    })
  },
  completeLogin({ commit }, userInfo) {
    return completeLogin(userInfo).then(() => {
      commit('SET_LOGIN_INFO_PENDING', true)
    })
  },
  // get user info
  async getInfo({ commit }) {
    const user_info = await fetchUserInfo()
    const permissions = Array.isArray(user_info?.permissions) ? user_info.permissions : []

    if (!user_info || !user_info.userId) {
      throw new Error('登录状态无效')
    }

    // 菜单权限直接使用服务端权限码；前端不自行推导或扩大权限范围。
    const menu_list = permissions

    commit('SET_USER_INFO', user_info)
    commit('SET_MENU_LIST', menu_list)
    return { menu_list, navigation: user_info.navigation || [] }
  },
  // user logout
  async logout({ dispatch }) {
    // 服务端退出是尽力而为；即使接口不可用，也必须清理本地会话。
    try {
      await logout()
    } catch (error) {
      // logout() 已经负责展示请求错误，这里吞掉异常以保证调用方继续跳转登录页。
      console.warn('服务端退出接口调用失败，已清理本地登录状态', error)
    } finally {
      await dispatch('resetToken')
      resetRouter()
      // reset visited views and cached views
      try {
        await dispatch('tagsView/delAllViews', null, { root: true })
      } catch (error) {
        // 标签缓存清理失败不应阻止退出登录跳转。
        console.warn('退出时清理标签缓存失败', error)
      }
    }
  },
  // remove token
  resetToken({ commit }) {
    commit('SET_USER_INFO', {})
    commit('SET_LOGIN_INFO_PENDING', false)
    commit('SET_MENU_LIST', [])
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
}
