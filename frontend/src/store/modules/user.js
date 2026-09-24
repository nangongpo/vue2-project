import { completeLogin, login, getInfo, logout } from '@/api/user'
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
  SET_BATCH_OPTIONS: (state, allOptions = {}) => {
    const newOptions = {}
    for (const key in allOptions) {
      if (allOptions[key] && allOptions[key].length > 0) {
        newOptions[key] = allOptions[key]
      }
    }
    state.all_options = { ...state.all_options, ...newOptions }
  },
}

const actions = {
  // user login
  login({ commit }, userInfo) {
    return new Promise((resolve, reject) => {
      login(userInfo)
        .then(() => {
          commit('SET_LOGIN_INFO_PENDING', true)
          resolve()
        })
        .catch(reject)
    })
  },
  completeLogin({ commit }, userInfo) {
    return new Promise((resolve, reject) => {
      completeLogin(userInfo)
        .then(() => {
          commit('SET_LOGIN_INFO_PENDING', true)
          resolve()
        })
        .catch(reject)
    })
  },
  // get user info
  getInfo({ commit }) {
    return new Promise((resolve, reject) => {
      const resolveData = (data) => {
        const user_info = data?.user || data?.user_info || (data?.userId ? data : {})
        const options = data?.options || {}
        const permissions = user_info.permissions || []
        // 菜单权限直接使用服务端权限码；前端不自行推导或扩大权限范围。
        const menu_list = user_info.menu_list || permissions

        if (!user_info.userId) {
          reject(new Error('登录状态无效'))
          return
        }

        commit('SET_USER_INFO', user_info)
        commit('SET_MENU_LIST', menu_list)
        commit('SET_ALL_OPTIONS', options)
        resolve({ menu_list })
      }
      getInfo().then(resolveData).catch(reject)
    })
  },
  // user logout
  logout({ commit, dispatch }) {
    return new Promise((resolve, reject) => {
      logout()
        .then(() => {
          commit('SET_USER_INFO', {})
          commit('SET_LOGIN_INFO_PENDING', false)
          commit('SET_MENU_LIST', [])
          resetRouter()
          // reset visited views and cached views
          dispatch('tagsView/delAllViews', null, { root: true })

          resolve()
        })
        .catch((error) => {
          reject(error)
        })
    })
  },
  // remove token
  resetToken({ commit }) {
    return new Promise((resolve) => {
      commit('SET_USER_INFO', {})
      commit('SET_LOGIN_INFO_PENDING', false)
      commit('SET_MENU_LIST', [])
      resolve()
    })
  },
}

export default {
  namespaced: true,
  state,
  mutations,
  actions,
}
