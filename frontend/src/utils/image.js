import Compressor from 'compressorjs'
import { uploadFile } from '@/api'

// https://www.npmjs.com/package/compressorjs
/**
 * 图片压缩
 * @param {File} file
 * @param {String} type  image/jpeg, image/png 强制转换类型 (可选)
 */
export function imageCompress(file, type) {
  return new Promise((resolve, reject) => {
    if (file.size > 10 * 1024 * 1024) {
      return reject(new Error('文件应小于10M'))
    }

    // 直接使用相同的长边限制，compressorjs 会自动按比例缩放
    const MAX_DIMENSION = 1920

    new Compressor(file, {
      strict: true,
      checkOrientation: true, // 保持拍摄方向
      // 关键改动：根据原图比例动态调整
      maxWidth: MAX_DIMENSION,
      maxHeight: MAX_DIMENSION,
      quality: 0.8,
      convertSize: 2048000, // 超过2MB的PNG尝试转成JPEG以减小体积
      mimeType: type || 'auto',
      success: (result) => {
        // 封装返回 File 对象
        const newFile = new File([result], file.name, {
          type: result.type
        })
        resolve(newFile)
      },
      error: (err) => {
        reject(err)
      }
    })
  })
}

export function isImageType(path = '') {
  return /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(path)
}

export function isVideoType(path) {
  return /\.(mp4|mov|avi|wmv)$/i.test(path)
}

/**
 * 文件转base64
 * @param {File} file
 * @param {Boolean} hasHeader 是否去除base64头, 默认true
 * @return {String}
 */
export function fileToBase64(file, hasHeader = true) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onabort = reader.onerror = reject
    reader.onloadend = (e) => {
      let result = e.target.result
      if (!hasHeader) {
        result = result.split(',')[1]
      }
      resolve(result)
    }
    reader.readAsDataURL(file)
  })
}

/**
 * base64转文件
 * @param {File} base64
 * @return {File}
 */
export function base64ToFile(base64, filename) {
  const arr = base64.split(',')
  const mime = arr[0].match(/:(.*?);/)[1]
  const suffix = mime.split('/')[1]
  const bstr = atob(arr[1])
  let n = bstr.length
  const u8arr = new Uint8Array(n)
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n)
  }
  return new File([u8arr], `${filename}.${suffix}`, {
    type: mime
  })
}

/**
 * png base64
 */
export function getPngImage(str) {
  return str ? `data:image/png;base64,${str}` : ''
}

/**
 * jpeg base64
 */
export function getJpegImage(str) {
  return str ? `data:image/jpeg;base64,${str}` : ''
}

/**
 * base64 image
 * @param {string} str
 * @returns {Boolean}
 */
export function isBase64Image(str) {
  return str?.indexOf(';base64,') > -1
}

/**
 * 上传图片
 * @param {File} file
 * @param {Object} config 配置项
 * @param {Object} otherOpts 其他上传参数
 * @returns {Promise}
 */
export function uploadImage(file, config = {}, otherOpts = {}) {
  return imageCompress(file, file.type)
    .then(file => uploadFile({ file, img_type: config.prop, ...otherOpts }))
}

/**
 * 确保当前帧已就绪
 * @param {HTMLVideoElement} video
 * @returns  {Promise<undefined>}
 */
export function videoSeekReady(video) {
  return new Promise(resolve => {
    if (video.readyState >= 2) {
      resolve()
    } else {
      video.onseeked = () => resolve()
    }
  })
}

/**
 * 将当前帧保存成图片
 * @param {HTMLVideoElement} video
 * @returns {HTMLImageElement}
 */
export function captureCurrentFrame(video) {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  const img = new Image()
  img.src = canvas.toDataURL('image/jpeg', 1)
  return img
}
