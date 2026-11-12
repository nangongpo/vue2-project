import { createCaptcha } from './core.js'

export { createCaptcha }

if (typeof window !== 'undefined') window.CaptchaSdk = { createCaptcha }
