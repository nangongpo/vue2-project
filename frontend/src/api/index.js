import service, { notify } from './axios'
import { fileToBase64 } from '@/utils/image'

/**
 * 公用请求
 * @param {object} options { url, method, params, header, config }
 * {
    * url @param {string} 请求地址
    * method @param {string} 请求方法
    * params @param {object} 请求参数
    * headers @param {object} 自定义请求头, 如上传文件 { 'Content-Type': 'multipart/form-data' }
    * config @param {object} 自定义配置项
 * }
 * @returns {promise}
 */
export async function sendRequest(options = {}) {
  const {
    url = '',
    method = '',
    params = {},
    config = { showNotify: true }
  } = options
  // 是否是url传參(get,delete请求为url传參)
  const isUrlParams = /(get|delete|head)/.test(method)
  // url传参，需传递params参数
  let _params = {}
  // body传参，需传递data参数
  const _data = {}

  if (isUrlParams) {
    _params = params
  } else {
    // 文件转成base64, 方便统一加密
    for (const key in params) {
      const value = params[key]
      if (value instanceof File) {
        const base64Str = await fileToBase64(value)
        _data[key] = {
          file_name: value.name,
          file_size: value.size,
          file_type: value.type,
          base64: base64Str.split(',')[1]
        }
      } else {
        _data[key] = params[key]
      }
    }
  }
  // url传參(url不能为空)， body传參(url和data参数不能为空)
  const flag = isUrlParams ? url.length === 0 : url.length === 0 && _data
  // 构造请求参数
  const baseConfig = { method, url, params: _params, data: _data }
  return new Promise((resolve, reject) => {
    if (flag) {
      notify({ message: '请求参数丢失', type: 'error' })
      reject(new Error(`请求参数丢失: ${JSON.stringify(options)}`))
      return
    }
    service({
      ...baseConfig,
      ...config
    }).then(data => {
      resolve(data)
    }).catch(error => {
      const traceID = error?.traceId
      config.showNotify && error.message && notify({
        dangerouslyUseHTMLString: true,
        title: '操作提示',
        message: `<strong>错误信息:${error.message}</strong></br>消息码:${traceID}`
      })
      reject(error)
    })
  })
}

// get请求
export function axiosGet(url, params, config) {
  return sendRequest({
    url,
    method: 'get',
    params,
    config
  })
}

// post请求
export function axiosPost(url, params, config) {
  return sendRequest({
    url,
    method: 'post',
    params,
    config
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
export async function uploadFile(params = {}) {
  if (!params.img_source) {
    params.img_source = '2'
  }
  // 文件转成base64, 方便统一加密
  const data = {}
  for (const key in params) {
    const value = params[key]
    if (value instanceof File) {
      const base64Str = await fileToBase64(value)
      data[key] = {
        file_name: value.name,
        file_size: value.size,
        file_type: value.type,
        base64: base64Str.split(',')[1]
      }
    } else {
      data[key] = value
    }
  }

  return new Promise((resolve, reject) => {
    sendRequest({
      url: '/upload_img/',
      method: 'post',
      params: data
    }).then(res => {
      resolve(res.url)
    }).catch(reject)
  })
}
