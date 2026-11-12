import { createElement } from '../dom.js'
import { createDrag } from './drag.js'

export function renderSimpleSlider(root, challenge, submit, scope) {
  const value = challenge.payload
  const panel = createElement('div', 'tac__panel tac__simple-slider')
  const message = createElement('div', 'tac__message')
  root.appendChild(panel)
  const maxX = value.trackWidth - value.buttonWidth
  const drag = createDrag(panel, scope, {
    initialX: maxX,
    maxX,
    onMove: () => {},
    onEnd: (answer) => submit({ ...answer, trackWidth: value.trackWidth }, message, drag.success, drag.reset),
  })
  panel.appendChild(message)
}
