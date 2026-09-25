import service, { notifyRequestError } from './http'

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
  const { showNotify = true, ...axiosConfig } = config
  const requestConfig = {
    ...axiosConfig,
    method: normalizedMethod,
    url,
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
