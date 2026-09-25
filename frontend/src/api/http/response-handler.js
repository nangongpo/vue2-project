import { checkType } from '@/utils'
import { isSuccessCode, REQUEST_MESSAGE } from './codes'
import {
  handleUnauthorized,
  isAuthRequest,
  isUnauthorizedCode,
} from './session-expired'

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

  if (isUnauthorizedCode(code) && !isAuthRequest(response.config?.url)) {
    normalizedError.silent = true
    handleUnauthorized().catch(() => {})
  }

  return Promise.reject(normalizedError)
}
