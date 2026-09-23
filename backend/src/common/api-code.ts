/**
 * API 业务码：六位字符串，避免前端因不同语言的数字精度或前导零产生歧义。
 */
export const API_CODE = {
  SUCCESS: '000000',
  INVALID_PARAMS: '100001',
  UNAUTHORIZED: '100002',
  FORBIDDEN: '100003',
  NOT_FOUND: '100004',
  CONFLICT: '100005',
  RATE_LIMITED: '100006',
  REQUEST_IN_PROGRESS: '100009',
  CAPTCHA_REQUIRED: '100007',
  CAPTCHA_INVALID: '100008',
  INTERNAL_ERROR: '200000',
  DATABASE_ERROR: '200001',
} as const

export type ApiCode = typeof API_CODE[keyof typeof API_CODE]

export const API_TITLE: Record<ApiCode, string> = {
  [API_CODE.SUCCESS]: '成功',
  [API_CODE.INVALID_PARAMS]: '请求参数无效',
  [API_CODE.UNAUTHORIZED]: '身份认证失败',
  [API_CODE.FORBIDDEN]: '访问被拒绝',
  [API_CODE.NOT_FOUND]: '资源未找到',
  [API_CODE.CONFLICT]: '资源状态冲突',
  [API_CODE.RATE_LIMITED]: '请求频率受限',
  [API_CODE.REQUEST_IN_PROGRESS]: '请求处理中',
  [API_CODE.CAPTCHA_REQUIRED]: '需要完成验证码',
  [API_CODE.CAPTCHA_INVALID]: '验证码校验失败',
  [API_CODE.INTERNAL_ERROR]: '服务器错误',
  [API_CODE.DATABASE_ERROR]: '数据服务不可用',
}

export const API_MESSAGE: Record<ApiCode, string> = {
  [API_CODE.SUCCESS]: '操作成功',
  [API_CODE.INVALID_PARAMS]: '请求参数错误',
  [API_CODE.UNAUTHORIZED]: '未登录或登录已失效',
  [API_CODE.FORBIDDEN]: '无权执行此操作',
  [API_CODE.NOT_FOUND]: '资源不存在',
  [API_CODE.CONFLICT]: '请求与当前资源状态冲突',
  [API_CODE.RATE_LIMITED]: '请求过于频繁，请稍后重试',
  [API_CODE.REQUEST_IN_PROGRESS]: '登录请求处理中，请勿重复提交',
  [API_CODE.CAPTCHA_REQUIRED]: '请先完成滑块验证',
  [API_CODE.CAPTCHA_INVALID]: '滑块验证失败，请重试',
  [API_CODE.INTERNAL_ERROR]: '服务器内部错误',
  [API_CODE.DATABASE_ERROR]: '数据服务暂不可用',
}
