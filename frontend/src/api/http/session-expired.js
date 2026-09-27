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
    .then(async () => {
      const currentPath = router.currentRoute?.fullPath || '/'
      const loginLocation = currentPath === '/login'
        ? { path: '/login' }
        : { path: '/login', query: { redirect: currentPath } }

      // 导航必须独立于本地状态清理；清理失败不能阻止用户回到登录页。
      try {
        await store.dispatch('user/resetToken')
      } finally {
        resetRouter()
        await router.replace(loginLocation)
      }

      try {
        await store.dispatch('tagsView/delAllViews', null, { root: true })
      } catch {
        // 标签缓存清理失败不影响会话失效后的登录跳转。
      }
    })
    .then(
      (value) => value,
      (error) => Promise.reject(error)
    )
    .finally(() => {
      sessionExpiredPromise = null
      sessionExpiredHandled = false
    })

  return sessionExpiredPromise
}
