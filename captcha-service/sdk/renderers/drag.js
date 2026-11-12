import { createElement } from '../dom.js'

// Shared input mechanics only. Each renderer owns its image, direction and answer.
export function createDrag(root, scope, { initialX, maxX, onMove, onEnd }) {
  const track = createElement('div', 'tac__track')
  const progress = createElement('div', 'tac__progress')
  const button = createElement('button', 'tac__button', initialX > 0 ? '←' : '→')
  button.type = 'button'
  button.setAttribute('aria-label', '拖动滑块，或用方向键移动后按回车提交')
  button.setAttribute('role', 'slider')
  button.setAttribute('aria-valuemin', '0')
  button.setAttribute('aria-valuemax', String(maxX))
  button.style.touchAction = 'none'
  track.append(progress, button)
  root.appendChild(track)
  let x = initialX
  let drag = null
  let points = []
  const setX = (next) => {
    x = Math.max(0, Math.min(maxX, next))
    const ratio = maxX ? x / maxX : 0
    button.style.left = `calc(${ratio * 100}% - ${ratio * (button.offsetWidth || 42)}px)`
    button.setAttribute('aria-valuenow', String(Math.round(x)))
    progress.style.width = `${maxX ? (x / maxX) * 100 : 0}%`
    onMove(x)
  }
  const record = () => {
    const last = points.at(-1)
    points.push({ x: Math.round(x), y: 20, t: Math.max(Date.now() - drag.started, last ? last.t + 1 : 0) })
    if (points.length > 280) points = points.filter((_, i) => i === 0 || i % 2 || i === points.length - 1)
  }
  const release = () => {
    if (drag && typeof drag.id === 'number' && button.hasPointerCapture?.(drag.id))
      button.releasePointerCapture(drag.id)
    drag = null
    track.classList.remove('is-dragging')
  }
  scope.cleanup(release)
  scope.bind(button, 'pointerdown', (event) => {
    if (
      button.disabled ||
      button.closest('fieldset')?.disabled ||
      drag ||
      (event.button !== undefined && event.button !== 0)
    )
      return
    event.preventDefault()
    drag = { id: event.pointerId, clientX: event.clientX, x, started: Date.now() }
    points = []
    track.classList.add('is-dragging')
    record()
    button.setPointerCapture?.(event.pointerId)
  })
  const move = (event) => {
    if (!drag || drag.id !== event.pointerId) return
    const travel = track.clientWidth - button.offsetWidth
    if (travel <= 0) return
    setX(drag.x + ((event.clientX - drag.clientX) / travel) * maxX)
    record()
  }
  scope.bind(button, 'pointermove', move)
  scope.bind(button, 'pointerup', (event) => {
    if (!drag || drag.id !== event.pointerId) return
    move(event)
    record()
    const answer = { points: points.slice(), finalX: Math.round(x) }
    release()
    onEnd(answer)
  })
  scope.bind(button, 'pointercancel', () => {
    release()
    setX(initialX)
  })
  scope.bind(button, 'keydown', (event) => {
    if (button.disabled || button.closest('fieldset')?.disabled) return
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      if (!drag) {
        track.classList.add('is-dragging')
        drag = { id: 'keyboard', started: Date.now() }
        points = []
        record()
      }
      if (drag.id !== 'keyboard') return
      setX(x + ((event.key === 'ArrowLeft' ? -1 : 1) * maxX) / 12)
      record()
    } else if (event.key === 'Enter' && drag?.id === 'keyboard') {
      event.preventDefault()
      record()
      const answer = { points: points.slice(), finalX: Math.round(x) }
      release()
      onEnd(answer)
    }
  })
  setX(initialX)
  return {
    track,
    button,
    reset: () => setX(initialX),
    success: () => {
      button.disabled = true
      button.classList.add('ok')
      button.textContent = '✓'
    },
  }
}
