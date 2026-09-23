// 无需登录的接口，普通加密
import axios from 'axios'
import { isDev, errorHandler, getCustomHeader } from './axios'
import { xEncrypt, xDecrypt } from '@/utils/crypto'
import { checkType } from '@/utils'
import { isSuccessCode, REQUEST_MESSAGE } from './codes'

const isEncrypt = import.meta.env.VITE_APP_ENCRYPT === 'true'

// 自定义请求
const instance = axios.create({
  baseURL: import.meta.env. VITE_APP_BASE_API,
  withCredentials: false, // 跨域请求携带cookies
  timeout: 10 * 1000, // 10s请求超时
  transformRequest: [
    function (data, headers) {
      return isEncrypt ? xEncrypt(data) : data
    },
    ...axios.defaults.transformRequest
  ],
  transformResponse: [
    function (data, headers) {
      return isEncrypt ? xDecrypt(data) : data
    }
  ]
})

// 请求拦截器
instance.interceptors.request.use(config => {
  config.headers = getCustomHeader(config.headers)

  if (isDev && isEncrypt) {
    console.log(config.url + ' 请求参数', config.data)
  }

  return config
}, (error) => {
  return Promise.reject(error)
})

// 响应拦截器
instance.interceptors.response.use(
  response => {
    if (isDev && isEncrypt) {
      console.log(response.config.url + ' 响应值', response.data)
    }
    const { code, msg, data, timestamp } = response.data
    if (isSuccessCode(code)) {
      return checkType(data, 'object') ? { ...data, timestamp } : data
    }
    return Promise.reject({ ...response, data, code, message: msg || REQUEST_MESSAGE[code] })
  },
  errorHandler
)

/** 获取密匙 */
export function getVertifyInfo() {
  return instance({
    url: '/verify/',
    method: 'post'
  })
}
