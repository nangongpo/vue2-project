import Vue from 'vue'

import store from '@/store'
import { REQUEST_CODE } from './codes'

let sessionExpiredPromise = null

export function isAuthRequest(url = '') {
  return /\/auth\/(?:login(?:\/complete)?|logout)$/.test(url)
}

export function isUnauthorizedCode(code) {
  return code === REQUEST_CODE.UNAUTHORIZED
}

export function handleUnauthorized() {
  if (sessionExpiredPromise) return sessionExpiredPromise
  
  sessionExpiredPromise = Vue.prototype.$msgbox
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
    .then(() => window.location.reload())
    .then(
      (value) => {
        sessionExpiredPromise = null
        return value
      },
      (error) => {
        sessionExpiredPromise = null
        return Promise.reject(error)
      }
    )

  return sessionExpiredPromise
}
