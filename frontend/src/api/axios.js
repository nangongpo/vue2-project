import Vue from 'vue'
import axios from 'axios'

import store from '@/store'
import { checkType } from '@/utils'
import { isSuccessCode, REQUEST_CODE, REQUEST_MESSAGE } from './codes'

export const isDev = import.meta.env.DEV

// 主体请求
const request = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  withCredentials: true,
  timeout: 10 * 1000, // 10s请求超时
})

// 请求拦截器
request.interceptors.request.use(
  (config) => {
    config.headers = getCustomHeader(config.headers)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(responseHandler, errorHandler)

export default request

export function getCustomHeader(headers) {
  return Object.assign(headers || {}, {
    'Content-Type': 'application/json',
  })
}

let authPromptPromise = null
let authPromptLocked = false
let securityStepUpHandler = null

export function setSecurityStepUpHandler(handler) {
  securityStepUpHandler = typeof handler === 'function' ? handler : null
}

function codeFromStatus(status) {
  return (
    {
      400: REQUEST_CODE.INVALID_PARAMS,
      401: REQUEST_CODE.UNAUTHORIZED,
      403: REQUEST_CODE.FORBIDDEN,
      404: REQUEST_CODE.NOT_FOUND,
      409: REQUEST_CODE.CONFLICT,
      429: REQUEST_CODE.RATE_LIMITED,
      503: REQUEST_CODE.SERVICE_UNAVAILABLE,
    }[status] || (status >= 500 ? REQUEST_CODE.INTERNAL_ERROR : '')
  )
}

function handleUnauthorized() {
  if (!authPromptLocked) {
    authPromptLocked = true
    authPromptPromise = confirm({
      title: '消息提示',
      message: '登录失效，请重新登录',
      showCancelButton: false,
      roundButton: true,
      closeOnHashChange: false,
    })
      .then(() =>
        store.dispatch('user/resetToken').then(() => {
          window.location.reload()
        })
      )
      .catch((error) => {
        authPromptLocked = false
        authPromptPromise = null
        return Promise.reject(error)
      })
  }
  return authPromptPromise || Promise.resolve()
}

function isTimeoutError(error) {
  return (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    /timeout/i.test(error?.message || '')
  )
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
  const traceId =
    problem.traceId ||
    problem.data?.traceId ||
    response?.headers?.['x-request-trace-id'] ||
    error?.config?.headers?.['X-Request-Trace-Id']
  const message = response
    ? problem.detail ||
      problem.message ||
      REQUEST_MESSAGE[code] ||
      (status ? `请求失败（HTTP ${status}）` : '请求失败')
    : isTimeoutError(error)
    ? '请求超时，请稍后重试'
    : '无法连接服务器，请检查网络或服务状态'

  const normalizedError = new Error(message)
  Object.assign(normalizedError, {
    name: error?.name || 'RequestError',
    code,
    status,
    data: problem.data ?? null,
    detail: problem.detail || problem.message || message,
    title: problem.title,
    traceId,
    config: error?.config,
    response,
    requestError: error,
  })

  if (code === REQUEST_CODE.SECURITY_STEP_UP_REQUIRED) {
    normalizedError.silent = true
    if (securityStepUpHandler && !error?.config?.__stepUpRetried) {
      return securityStepUpHandler({
        riskLevel: normalizedError.data?.riskLevel,
        operationCode: normalizedError.data?.operationCode,
        requiredFactors: normalizedError.data?.requiredFactors || [],
        error: normalizedError,
      }).then((verified) => {
        if (!verified) return Promise.reject(normalizedError)
        const retryConfig = {
          ...error.config,
          __stepUpRetried: true,
          headers: { ...(error.config?.headers || {}) },
        }
        return request(retryConfig)
      })
    }
  }

  if (code === REQUEST_CODE.UNAUTHORIZED && !error?.config?.url?.endsWith('/auth/login')) {
    handleUnauthorized().catch(() => {})
  }

  if (isDev)
    console.error('[request error]', { code, status, message, traceId, url: error?.config?.url })
  return Promise.reject(normalizedError)
}

export function responseHandler(response) {
  const payload = response.data
  // 文件、文本或非标准响应直接返回。
  if (
    !payload ||
    typeof payload !== 'object' ||
    !Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    return response
  }
  const { code, data, msg, message, timestamp } = payload

  if (isSuccessCode(code)) {
    return checkType(data, 'object') ? { ...data, timestamp } : data
  }
  const normalizedError = new Error(msg || message || REQUEST_MESSAGE[code] || '请求失败')
  Object.assign(normalizedError, {
    response,
    data,
    code,
    status: response.status,
    config: response.config,
  })
  if (code === REQUEST_CODE.UNAUTHORIZED && !response.config?.url?.endsWith('/auth/login')) {
    handleUnauthorized().catch(() => {})
  }
  return Promise.reject(normalizedError)
}

export function notify(opts) {
  return Vue.prototype.$notify({
    type: 'error',
    position: 'top-right',
    showClose: true,
    title: '操作提示',
    ...opts,
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
    ...newOpts,
  })
}
