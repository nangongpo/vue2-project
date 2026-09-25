import axios from 'axios'

import { handleUnauthorized, isAuthRequest, isUnauthorizedCode } from './session-expired'
import { REQUEST_CODE, REQUEST_MESSAGE } from './codes'
import { responseHandler } from './response-handler'

export const isDev = import.meta.env.DEV

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

function isTimeoutError(error) {
  return (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    /timeout/i.test(error?.message || '')
  )
}

export function createErrorHandler(request) {
  return function errorHandler(error) {
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
      silent: Boolean(error?.silent),
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

    if (isUnauthorizedCode(code) && !isAuthRequest(error?.config?.url)) {
      normalizedError.silent = true
      handleUnauthorized().catch(() => {})
    }

    if (isDev) {
      console.error('[request error]', {
        code,
        status,
        message,
        traceId,
        url: error?.config?.url,
      })
    }

    return Promise.reject(normalizedError)
  }
}

/**
 * 为 Axios 实例注册当前模块固定的响应处理器和错误处理器。
 *
 * @param {import('axios').AxiosInstance} request Axios 实例
 * @returns {{ errorHandler: Function, dispose: Function }} 错误处理器和拦截器清理方法
 */
export function setupErrorHandler(request) {
  const errorHandler = createErrorHandler(request)
  const interceptorId = request.interceptors.response.use(responseHandler, errorHandler)

  return {
    errorHandler,
    dispose() {
      request.interceptors.response.eject(interceptorId)
    },
  }
}
