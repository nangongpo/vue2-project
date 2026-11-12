import { SceneConfig, ServiceBinding } from '#app/captcha/services/captcha.engine.js'
const defaultScene: SceneConfig = {
  allowedCaptchaTypes: ['SIMPLE_SLIDER', 'SLIDER', 'ROTATE', 'GRID_IMAGE_SELECT', 'CLICK_ORDER'],
  defaultCaptchaType: 'SLIDER',
  allowedModes: ['EMBED', 'POPUP'],
  defaultMode: 'POPUP',
  ttl: Number(process.env.CAPTCHA_CHALLENGE_TTL || 120),
  status: 'ACTIVE',
  rotation: {
    strategy: 'WEIGHTED_RANDOM',
    avoidConsecutiveRepeat: true,
    weights: { SIMPLE_SLIDER: 20, SLIDER: 25, ROTATE: 15, GRID_IMAGE_SELECT: 25, CLICK_ORDER: 15 },
  },
}
export function loadBindings(): ServiceBinding[] {
  if (process.env.CAPTCHA_SERVICE_BINDINGS)
    return (JSON.parse(process.env.CAPTCHA_SERVICE_BINDINGS) as ServiceBinding[]).map((b) => ({
      ...b,
      scenes: b.scenes || { login: defaultScene },
    }))
  return [
    {
      serviceId: process.env.CAPTCHA_SERVICE_ID || 'backend-admin',
      secret: process.env.CAPTCHA_SERVICE_SECRET || '',
      prefix: process.env.CAPTCHA_PREFIX || 'yaxbgo',
      status: 'ACTIVE',
      scenes: { login: defaultScene, LOGIN: defaultScene },
    },
  ]
}
export function findBinding(bindings: ServiceBinding[], id: string) {
  return bindings.find((b) => b.serviceId === id && b.status === 'ACTIVE')
}
