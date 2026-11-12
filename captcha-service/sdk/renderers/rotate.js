import { createElement } from '../dom.js'

export function renderRotate(root, challenge, submit, scope) {
  const value = challenge.payload
  const panel = createElement('div', 'tac__panel')
  const stage = createElement('div', 'tac__rotate-stage')
  const image = document.createElement('img')
  image.className = 'tac__rotate-image'
  image.src = value.image
  image.alt = '旋转图片使其正向朝上'
  const range = document.createElement('input')
  range.type = 'range'
  range.className = 'tac__range'
  range.min = String(value.minAngle)
  range.max = String(value.maxAngle)
  range.step = String(value.rotationStep)
  range.value = String(value.initialAngle)
  range.setAttribute('aria-label', '旋转角度')
  const update = () => {
    image.style.transform = `rotate(${range.value}deg)`
    range.setAttribute('aria-valuetext', `${range.value} 度`)
  }
  scope.bind(range, 'input', update)
  update()
  const message = createElement('div', 'tac__message')
  stage.append(image, message)
  const controls = createElement('div', 'tac__controls tac__controls--rotate')
  controls.append(range)
  panel.append(stage, controls)
  scope.bind(range, 'change', () => submit({ finalAngle: Number(range.value) }, message))
  root.appendChild(panel)
}
