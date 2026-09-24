import axios from 'axios'
import {
  getCustomHeader,
  responseHandler,
  errorHandler,
} from './axios'

const instance = axios.create({
  baseURL: import.meta.env.VITE_APP_BASE_API,
  withCredentials: false, // 跨域请求携带cookies
  timeout: 30 * 1000, // 30s请求超时
})

// 请求拦截器
instance.interceptors.request.use(
  (config) => {
    config.headers = getCustomHeader(config.headers)
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
instance.interceptors.response.use(responseHandler, errorHandler)

/**
 * 分块导入
 * @param {object} data
 * @param {string} data.file_id
 * @param {number} data.chunk_number
 * @param {string} data.file_type img | video
 * @param {file} data.file
 */
export function importFile(data = {}, opts = {}) {
  const formData = new FormData()
  for (const key in data) {
    formData.append(key, data[key])
  }
  return instance({
    url: '/upload_file_chunk/',
    method: 'post',
    data: formData,
    headers: { 'Content-Type': 'multipart/form-data' },
    ...opts,
  })
}

const request = instance

/**
 * 获取文件ID
 * @param {object} data
 * @param {string} data.file_name 文件名称
 * @param {number} data.file_size 文件总大小
 * @param {string} data.file_type 文件类型 img、video
 */
export function getFileID(data = {}) {
  return request({
    url: '/upload_file_id/',
    method: 'post',
    data,
  })
}

let networkSpeedKBps = 128
let lastSpeedTime = 0
const SPEED_CACHE_DURATION = 4000 // 4秒内不重复测速

// 定义切片的最大值与最小值
const MIN_CHUNK = 1024 * 100 // 100KB
const MAX_CHUNK = 1024 * 1024 * 2 // 2MB

// 网速区间 => 基础切片大小（字节）
const speedChunkMap = new Map([
  [40, 102400], // < 40  → 100KB
  [100, 204800], // < 100 → 200KB
  [200, 524288], // < 200 → 512KB
  [500, 1048576], // < 500 → 1MB
  [Infinity, 2097152], // ≥500 → 2MB
])

const getTime = () => performance?.now() ?? Date.now()

export async function getFileIDWithSpeed(data) {
  const now = Date.now()
  let response

  if (now - lastSpeedTime < SPEED_CACHE_DURATION) {
    response = await getFileID(data)
    return response.data
  }

  const startTime = getTime()

  try {
    response = await getFileID(data)
  } catch (err) {
    // 请求失败，适度降速，避免切片突然变大
    networkSpeedKBps = Math.max(100, networkSpeedKBps * 0.7)
    lastSpeedTime = now
    throw err
  }

  const durationMs = getTime() - startTime

  if (durationMs < 1) {
    networkSpeedKBps = 1000 // 1000KB/s = 1MB/s 左右，符合快网
    lastSpeedTime = now
    return response.data
  }

  const durationSec = durationMs / 1000
  let bytes

  const contentLength = response.headers['content-length']
  if (contentLength && !isNaN(+contentLength)) {
    bytes = +contentLength
  } else {
    try {
      if (typeof response.data === 'string') {
        bytes = response.data.length * 1.1
      } else {
        bytes = JSON.stringify(response.data).length * 1.2
      }
    } catch {
      bytes = 1024 * 256
    }
  }

  const currentSpeed = bytes / durationSec / 1024
  networkSpeedKBps = networkSpeedKBps * 0.4 + currentSpeed * 0.6
  lastSpeedTime = now

  return response.data
}

export function getNetworkSpeed() {
  return Math.max(100, networkSpeedKBps)
}

/**
 * 高效切片计算
 * @param {number} speedKBps 网速 KB/s
 * @param {number} parallel  并行上传数
 * @returns {number} 最终切片字节数
 */
export function getChunkSize(speedKBps, parallel = 1) {
  const speed = Math.max(speedKBps, 10)
  const p = Math.max(parallel, 1)

  // 从 Map 找到对应基础切片
  let baseSize = MAX_CHUNK
  for (const [threshold, size] of speedChunkMap) {
    if (speed < threshold) {
      baseSize = size
      break
    }
  }

  // 并行缩减（位运算，最快）
  let finalSize = baseSize
  if (p >= 4) {
    finalSize >>= 2 // /4
  } else if (p >= 2) {
    finalSize >>= 1 // /2
  }

  // 限制上下界
  if (finalSize < MIN_CHUNK) return MIN_CHUNK
  if (finalSize > MAX_CHUNK) return MAX_CHUNK
  return finalSize
}
