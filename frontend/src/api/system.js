import { axiosGet } from './index'

export function getSystemHealth() {
  return axiosGet('/health', {}, { showNotify: false })
}
