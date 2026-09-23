import Vue from 'vue'
import axios from 'axios'

import store from '@/store'
import { xEncrypt, xDecrypt } from '@/utils/crypto'
import { addSign } from '@/utils/rsa'
import { checkType } from '@/utils'
import { isSuccessCode, REQUEST_CODE, REQUEST_MESSAGE } from './codes'

export const isDev = import.meta.env.DEV
const isEncrypt = import.meta.env.VITE_APP_ENCRYPT === 'true'

export const encrypData = (data) => {
  if (isEncrypt) {
    const { sign_private_key, aes_key, aes_iv } = store.state.user.vertifyInfo
    const signData = addSign(data, sign_private_key)
    return xEncrypt(signData, aes_key, { iv: aes_iv })
  }
  return data
}

export const decryptData = (data) => {
  if (isEncrypt) {
    const { aes_key, aes_iv } = store.state.user.vertifyInfo
    return xDecrypt(data, aes_key, { iv: aes_iv })
  }
  return data
}

// 主体请求
const request = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  withCredentials: true,
  timeout: 32 * 1000, // 32s请求超时
  transformRequest: [
    encrypData,
    ...axios.defaults.transformRequest
  ],
  transformResponse: [
    decryptData,
    ...axios.defaults.transformResponse
  ]
})

// 请求拦截器
request.interceptors.request.use(
  config => {
    config.headers = getCustomHeader(config.headers)
    if (isDev && isEncrypt) {
      console.log(config.url + ' 请求参数', config.data)
    }

    return config
  },
  error => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  responseHandler,
  errorHandler
)

export default request

export function getCustomHeader(headers) {
  return Object.assign(headers || {}, {
    'Content-Type': isEncrypt ? 'text/plain' : 'application/json'
  })
}

let authPromptPromise = null

function codeFromStatus(status) {
  return {
    400: REQUEST_CODE.INVALID_PARAMS,
    401: REQUEST_CODE.UNAUTHORIZED,
    403: REQUEST_CODE.FORBIDDEN,
    404: REQUEST_CODE.NOT_FOUND,
    409: REQUEST_CODE.CONFLICT,
    429: REQUEST_CODE.RATE_LIMITED
  }[status] || (status >= 500 ? REQUEST_CODE.INTERNAL_ERROR : '')
}

function handleUnauthorized() {
  if (!authPromptPromise) {
    authPromptPromise = confirm({
      title: '消息提示',
      message: '登录失效，请重新登录',
      showCancelButton: false,
      roundButton: true
    }).then(() => store.dispatch('user/resetToken').then(() => {
      window.location.reload()
    })).catch(() => {}).finally(() => {
      authPromptPromise = null
    })
  }
  return authPromptPromise
}

function isTimeoutError(error) {
  return error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT' || /timeout/i.test(error?.message || '')
}

export function errorHandler(error) {
  // 被主动取消的请求不应弹出网络错误提示。
  if (axios.isCancel(error)) {
    error.message = undefined
    error.silent = true
    return Promise.reject(error)
  }

  const response = error?.response
  const problem = response?.data && typeof response.data === 'object' ? response.data : {}
  const status = response?.status || 0
  const code = problem.code || codeFromStatus(status)
  const traceId = problem.traceId || response?.headers?.['x-request-trace-id'] || error?.config?.headers?.['X-Request-Trace-Id']
  const message = response
    ? problem.detail || problem.message || REQUEST_MESSAGE[code] || (status ? `请求失败（HTTP ${status}）` : '请求失败')
    : isTimeoutError(error)
      ? '请求超时，请稍后重试'
      : '无法连接服务器，请检查网络或服务状态'

  const normalizedError = new Error(message)
  Object.assign(normalizedError, {
    name: error?.name || 'RequestError',
    code,
    status,
    data: problem.data ?? null,
    detail: problem.detail || message,
    title: problem.title,
    traceId,
    config: error?.config,
    response,
    requestError: error
  })

  if (code === REQUEST_CODE.UNAUTHORIZED && !error?.config?.url?.endsWith('/auth/login')) {
    handleUnauthorized()
  }

  if (isDev) console.error('[request error]', { code, status, message, traceId, url: error?.config?.url })
  return Promise.reject(normalizedError)
}

export function responseHandler(response) {
  if (isDev && isEncrypt) {
    console.log(response.config.url + ' 响应值', response.data)
  }

  const payload = response.data
  // 文件、文本或非标准响应直接返回。
  if (!payload || typeof payload !== 'object' || !Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return response
  }
  const { code, data, msg, message, timestamp } = payload

  if (isSuccessCode(code)) {
    return checkType(data, 'object') ? { ...data, timestamp } : data
  }
  const normalizedError = new Error(msg || message || REQUEST_MESSAGE[code] || '请求失败')
  Object.assign(normalizedError, { response, data, code, status: response.status, config: response.config })
  return Promise.reject(normalizedError)
}

export function notify(opts) {
  return Vue.prototype.$notify({
    type: 'error',
    position: 'top-right',
    showClose: true,
    title: '操作提示',
    ...opts
  })
}

export function confirm(opts = {}) {
  const { title, message, ...newOpts } = opts
  return Vue.prototype.$msgbox.confirm(message, title, {
    type: 'warning',
    showClose: false,
    closeOnClickModal: false,
    closeOnPressEscape: false,
    center: true,
    customClass: 'confirm',
    ...newOpts
  })
}
