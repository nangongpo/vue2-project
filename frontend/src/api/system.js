import { axiosGet } from './index'

export function getSystemHealth() {
  return axiosGet('/health', {}, { showNotify: false })
}

export function getSystemStatus() {
  return axiosGet('/system/health', {}, { showNotify: false })
}
