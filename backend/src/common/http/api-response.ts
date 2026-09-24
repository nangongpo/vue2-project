import { API_CODE, ApiCode } from '../constants/api-code.js'

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
    typeof value.message === 'string'
  )
}
