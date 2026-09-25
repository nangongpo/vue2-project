import MessageBox from 'element-ui/lib/message-box.js'

import store from '@/store'
import router, { resetRouter } from '@/router'
import { getUrlPath } from '@/utils'
import { REQUEST_CODE } from './codes'

let sessionExpiredPromise = null
// 页面刷新完成前，可能还有其它请求陆续返回 401。只允许当前页面触发一次会话失效提示。
let sessionExpiredHandled = false

// 只需在这里维护需要排除会话失效处理的认证接口。
export const AUTH_REQUEST_PATHS = Object.freeze([
  '/auth/login',
  '/auth/login/complete',
  '/auth/logout',
])

export function isAuthRequest(url = '') {
  return AUTH_REQUEST_PATHS.includes(getUrlPath(url))
}

export function isUnauthorizedCode(code) {
  return code === REQUEST_CODE.UNAUTHORIZED
}

export function handleUnauthorized() {
  if (sessionExpiredPromise) return sessionExpiredPromise
  if (sessionExpiredHandled) return Promise.resolve()

  sessionExpiredHandled = true
  
  sessionExpiredPromise = MessageBox
    .confirm('登录失效，请重新登录', '消息提示', {
      type: 'warning',
      showClose: false,
      showCancelButton: false,
      closeOnClickModal: false,
      closeOnPressEscape: false,
      center: true,
      roundButton: true,
      closeOnHashChange: false,
      customClass: 'confirm',
    })
    .then(() => store.dispatch('user/resetToken'))
    .then(() => {
      resetRouter()
      return store.dispatch('tagsView/delAllViews', null, { root: true })
    })
    .then(() => router.replace('/login'))
    .then(
      (value) => {
        return value
      },
      (error) => {
        sessionExpiredPromise = null
        sessionExpiredHandled = false
        return Promise.reject(error)
      }
    )

  return sessionExpiredPromise
}
