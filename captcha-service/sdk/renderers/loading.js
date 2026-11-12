import { createElement } from '../dom.js'

// Loading is a dedicated view, never an old challenge left under a mask.
export function renderLoading(root) {
  const canvas = createElement('div', 'tac__loading-canvas')
  const message = createElement('div', 'tac__message', '正在加载验证码…')
  message.setAttribute('role', 'status')
  message.setAttribute('aria-live', 'polite')
  canvas.appendChild(message)
  root.replaceChildren(canvas, createElement('div', 'tac__controls'))
  return message
}
