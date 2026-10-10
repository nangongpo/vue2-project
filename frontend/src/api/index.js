import service, { notifyRequestError } from './http'

const MUTATING_METHODS = new Set(['post', 'put', 'patch', 'delete'])

// 幂等路由策略集中维护。新增接口时只需放入对应模式的 exact、prefixes 或 templates。
// shortLock：仅防止并发执行；full：允许安全重试并重放成功响应；disabled：不使用通用幂等。
const IDEMPOTENCY_ROUTE_POLICY = {
  shortLock: {
    exact: new Set(['/auth/login', '/auth/login/complete', '/auth/reauth', '/auth/session/renew']),
    prefixes: ['/auth/mfa/'],
    templates: [],
  },
  full: {
    exact: new Set(['/auth/tenant', '/auth/password']),
    prefixes: ['/users', '/roles', '/permission/', '/ops-tickets', '/files'],
    templates: [],
  },
  disabled: {
    exact: new Set(['/auth/logout']),
    prefixes: ['/captcha/'],
    templates: [
      '/files/uploads/:uploadId/parts/:partNumber',
      '/files/uploads/:uploadId/part-urls',
    ],
  },
}

function matchesPath(path, exact, prefixes, templates) {
  if (exact.has(path)) return true
  if (prefixes.some((prefix) => {
    const pathPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`
    return path === prefix || path.startsWith(pathPrefix)
  })) return true

  if (templates.length === 0) return false
  const pathSegments = path.slice(1).split('/')
  return templates.some((template) => {
    const templateSegments = template.slice(1).split('/')
    if (pathSegments.length !== templateSegments.length) return false
    return templateSegments.every((segment, index) => segment.startsWith(':') ? Boolean(pathSegments[index]) : segment === pathSegments[index])
  })
}

function matchesRoute(path, routePolicy) {
  return matchesPath(path, routePolicy.exact, routePolicy.prefixes, routePolicy.templates)
}

function resolveIdempotencyPolicy(path) {
  if (matchesRoute(path, IDEMPOTENCY_ROUTE_POLICY.disabled)) return 'disabled'
  if (matchesRoute(path, IDEMPOTENCY_ROUTE_POLICY.shortLock)) return 'shortLock'
  if (matchesRoute(path, IDEMPOTENCY_ROUTE_POLICY.full)) return 'full'
  return 'disabled'
}

/*
 * 保留统一入口，避免请求发送逻辑感知具体的幂等模式；当前调用方只需要知道是否携带 Key。
 */
function requiresIdempotency(method, url) {
  if (!MUTATING_METHODS.has(method)) return false
  const path = url.split('?')[0]
  return resolveIdempotencyPolicy(path) !== 'disabled'
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    return Array.from(bytes, (value) => {
      const hex = value.toString(16)
      return hex.length === 1 ? `0${hex}` : hex
    }).join('')
  }
  throw new Error('当前浏览器不支持安全随机数，无法发起幂等写请求')
}

function isQueryMethod(method) {
  return (
    method === 'get' ||
    method === 'delete' ||
    method === 'head' ||
    method === 'options'
  )
}

export function sendRequest({ url = '', method = 'get', params = {}, config = {} } = {}) {
  if (typeof url !== 'string' || !url.trim()) {
    return Promise.reject(new Error('请求地址不能为空'))
  }

  const normalizedMethod = method.toLowerCase()
  const { showNotify = true, idempotency = true, idempotencyKey, ...axiosConfig } = config
  const requestConfig = {
    ...axiosConfig,
    method: normalizedMethod,
    url,
  }

  if (idempotency && requiresIdempotency(normalizedMethod, url)) {
    requestConfig.headers = {
      ...(axiosConfig.headers || {}),
      'Idempotency-Key': idempotencyKey || createIdempotencyKey(),
    }
  }

  if (isQueryMethod(normalizedMethod)) {
    requestConfig.params = params
  } else {
    requestConfig.data = params
  }

  return service(requestConfig).catch((error) => {
    if (showNotify && !error?.silent && error?.message) {
      notifyRequestError(error)
    }
    return Promise.reject(error)
  })
}

// get请求
export function axiosGet(url, params, config) {
  return sendRequest({
    url,
    method: 'get',
    params,
    config,
  })
}

// post请求
export function axiosPost(url, params, config) {
  return sendRequest({
    url,
    method: 'post',
    params,
    config,
  })
}

/**
 * 文件上传
 * @param {Object} params
 * @param {File} params.file 文件对象
 * @param {String} params.img_type 图片字段
 * @param {String} params.img_source 图片来源 2pc端，3高拍仪, 默认为2
 * @returns {Promise}
 */
export function uploadFile(params = {}) {
  const formData = new FormData()
  const data = { ...params, img_source: params.img_source || '2' }

  for (const [key, value] of Object.entries(data)) {
    formData.append(key, value)
  }

  return sendRequest({
    url: '/upload_img/',
    method: 'post',
    params: formData,
  }).then((response) => response.url)
}
