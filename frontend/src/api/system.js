import { axiosGet } from './index'

export function getSystemStatus() {
  return axiosGet('/system/health', {}, { showNotify: false })
}
