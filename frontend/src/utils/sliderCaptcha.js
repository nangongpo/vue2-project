import { createTianaiCaptcha } from './tianaiCaptcha'

// 保留原有业务导出名，底层改为独立的 tianai-captcha 风格 Web SDK。
export function createSliderCaptcha(container, options) {
  return createTianaiCaptcha(container, options)
}

export default createSliderCaptcha
