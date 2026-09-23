// rsa 加签
import JSEncrypt from 'jsencrypt'
import sha256 from 'crypto-js/sha256'

// 请求加密
export function addSign(data, key) {
  const _data = data
  const signEncrypt = new JSEncrypt()
  signEncrypt.setPrivateKey(key)

  const dataString = JSON.stringify(_data)
  _data.sign = signEncrypt.sign(dataString, sha256, 'sha256')
  return _data
}
