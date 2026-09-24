import { axiosGet, axiosPost, sendRequest } from './index'

export function login(data) {
  // 登录过程中的 MFA_REQUIRED、MFA_INVALID 由登录页通过弹窗处理，不能触发全局错误通知。
  return axiosPost('/auth/login', data, { showNotify: false })
}

export function completeLogin(data) {
  return axiosPost('/auth/login/complete', data, { showNotify: false })
}

export function createCaptchaChallenge(data) {
  return axiosPost('/captcha/challenges', data)
}

export function verifyCaptcha(data) {
  return axiosPost('/captcha/verify', data)
}

export function reportCaptchaEvent(data) {
  return axiosPost('/captcha/events', data, { showNotify: false })
}

export function getInfo() {
  return axiosGet('/auth/me')
}

export function getMfaStatus() {
  return axiosGet('/auth/mfa/status')
}

export function logout() {
  return axiosPost('/auth/logout')
}

export function updatePassword(data) {
  return axiosPost('/auth/password', data)
}

export function getSessions() {
  return axiosGet('/auth/sessions')
}

export function revokeSession(id) {
  return sendRequest({ url: `/auth/sessions/${id}`, method: 'delete' })
}

export function getUnitInfo(data = {}) {
  return axiosPost('/user/page_user_unit/', data)
}

export function updateUnitInfo(data = {}) {
  return axiosPost('/user/update_user_unit/', data)
}

export default [
  { label: '登录', value: '/user/login/' },
  // { label: '获取登录信息', value: '/user/get_login_info/' },
  { label: '注销', value: '/user/logout/' },
  { label: '修改密码', value: '/auth/password/' },
]
