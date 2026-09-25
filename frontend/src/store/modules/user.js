import { completeLogin, login, getInfo as fetchUserInfo, logout } from '@/api/user'
import { resetRouter } from '@/router'
import { getOptions } from '@/utils/options'

const state = {
  menu_list: [],
  user_info: {},
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
  SET_ALL_OPTIONS: (state, allOptions = {}) => {
    const newOptions = {}
    const defaultOptions = getOptions()
    for (const key in allOptions) {
      if (Array.isArray(allOptions[key])) {
        const [property] = key.split('_map')
        newOptions[property] = allOptions[key]
      } else {
        newOptions[key] = allOptions[key]
      }
    }
    state.all_options = { ...defaultOptions, ...newOptions }
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
    commit('SET_ALL_OPTIONS')
    return { menu_list }
  },
  // user logout
  async logout({ dispatch }) {
    await logout()
    await dispatch('resetToken')
    resetRouter()
    // reset visited views and cached views
    await dispatch('tagsView/delAllViews', null, { root: true })
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
