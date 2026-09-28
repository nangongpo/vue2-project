import { API_CODE, type ApiCode } from '#app/common/constants/api-code.js'

const API_CODES = new Set<ApiCode>(Object.values(API_CODE))

export type ApiResponse<T> = {
  code: ApiCode
  message: string
  data: T
}

export function successResponse<T>(data: T): ApiResponse<T> {
  return { code: API_CODE.SUCCESS, message: 'success', data }
}

export function isApiResponse(value: unknown): value is ApiResponse<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'message' in value &&
    'data' in value &&
    typeof value.code === 'string' &&
    API_CODES.has(value.code as ApiCode) &&
    typeof value.message === 'string'
  )
}
