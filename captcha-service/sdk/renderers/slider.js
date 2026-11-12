import { createElement } from '../dom.js'
import { createDrag } from './drag.js'

export function renderSlider(root, challenge, submit, scope) {
  const value = challenge.payload
  const panel = createElement('div', 'tac__panel tac__puzzle-slider')
  const canvas = createElement('div', 'tac__canvas')
  const background = document.createElement('img')
  const piece = document.createElement('img')
  background.className = 'tac__background'
  background.alt = '请将拼图拖动到缺口'
  background.src = value.backgroundImage
  piece.className = 'tac__piece'
  piece.alt = ''
  piece.src = value.puzzleImage
  const message = createElement('div', 'tac__message')
  canvas.append(background, piece, message)
  panel.appendChild(canvas)
  root.appendChild(panel)
  const maxX = Math.min(value.trackWidth - value.buttonWidth, value.canvasWidth - value.pieceSize)
  const controls = createElement('div', 'tac__controls')
  panel.appendChild(controls)
  const drag = createDrag(controls, scope, {
    initialX: 0,
    maxX,
    onMove: (x) => {
      piece.style.width = `${((value.pieceSize + 4) / value.canvasWidth) * 100}%`
      piece.style.height = 'auto'
      piece.style.left = `${((x - 2) / value.canvasWidth) * 100}%`
      piece.style.top = `${((value.targetY - 2) / value.canvasHeight) * 100}%`
    },
    onEnd: (answer) => submit({ ...answer, trackWidth: value.trackWidth }, message, drag.success, drag.reset),
  })
  const hint = createElement('span', 'tac__slider-hint', '向右拖动完成拼图')
  drag.track.appendChild(hint)
  const namespace = 'http://www.w3.org/2000/svg'
  const icon = document.createElementNS(namespace, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('width', '20')
  icon.setAttribute('height', '20')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-width', '2')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('focusable', 'false')
  const path = document.createElementNS(namespace, 'path')
  path.setAttribute('d', 'M5 12h14M13 6l6 6-6 6')
  icon.appendChild(path)
  drag.button.replaceChildren(icon)
}
