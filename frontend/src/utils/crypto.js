// 对称加密
import AES from 'crypto-js/aes'
import enc from 'crypto-js/enc-utf8'
import Base64 from 'crypto-js/enc-base64'
import Utf8 from 'crypto-js/enc-utf8'
import defaultSettings from '@/settings'
import { isJSON } from '@/utils'

// 本地数据 加密
export function encrypt(data) {
  try {
    return AES.encrypt(JSON.stringify(data), import.meta.env.VITE_APP_SECRET, { iv: defaultSettings.name }).toString()
  } catch (err) {
    console.warn('encrypt: ' + err.message)
  }
}

// 本地数据 解密
export function decrypt(data) {
  try {
    if (typeof (data) === 'string') {
      const res = AES.decrypt(data, import.meta.env.VITE_APP_SECRET, { iv: defaultSettings.name }).toString(enc)
      return JSON.parse(res)
    }
  } catch (err) {
    console.warn('decrypt: ' + err.message)
  }
}

// 请求响应默认密匙
const xKey = import.meta.env.VITE_APP_BASE_API.substring(0, 16).padEnd(16, '0')
const xKeyBase64 = Base64.stringify(Utf8.parse(xKey))

// 请求加密
export function xEncrypt(data, key = xKeyBase64, config = { iv: xKeyBase64 }) {
  key = Base64.parse(key)
  config.iv = Base64.parse(config.iv)

  return AES.encrypt(JSON.stringify(data), key, config).toString()
}

// 请求解密
export function xDecrypt(data, key = xKeyBase64, config = { iv: xKeyBase64 }) {
  key = Base64.parse(key)
  config.iv = Base64.parse(config.iv)

  if (typeof (data) !== 'string') {
    return data
  }

  const decryptedData = AES.decrypt(data, key, config).toString(enc)
  return isJSON(decryptedData) ? JSON.parse(decryptedData) : data
}
