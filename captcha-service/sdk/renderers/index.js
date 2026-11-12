import { fail } from '../errors.js'
import { renderGrid } from './grid.js'
import { renderClickOrder } from './click-order.js'
import { renderRotate } from './rotate.js'
import { renderSimpleSlider } from './simple-slider.js'
import { renderSlider } from './slider.js'

export function renderChallenge(root, challenge, submit, scope) {
  if (challenge.captchaType === 'GRID_IMAGE_SELECT') return renderGrid(root, challenge, submit, scope)
  if (challenge.captchaType === 'CLICK_ORDER') return renderClickOrder(root, challenge, submit, scope)
  if (challenge.captchaType === 'ROTATE') return renderRotate(root, challenge, submit, scope)
  if (challenge.captchaType === 'SIMPLE_SLIDER') return renderSimpleSlider(root, challenge, submit, scope)
  if (challenge.captchaType === 'SLIDER') return renderSlider(root, challenge, submit, scope)
  fail('UNSUPPORTED_CAPTCHA_TYPE', `SDK 不支持题型 ${challenge.captchaType}`)
}
