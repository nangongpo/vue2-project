import { authStorage } from './web-storage'

export function getToken() {
  return authStorage.get('token')
}

export function setToken(token, expire) {
  return authStorage.set('token', token, expire)
}

export function removeToken() {
  return authStorage.remove('token')
}
