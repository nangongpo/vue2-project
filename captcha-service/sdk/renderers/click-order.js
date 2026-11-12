import { createElement } from '../dom.js'

export function renderClickOrder(root, challenge, submit, scope) {
  const value = challenge.payload
  const board = createElement('div', 'tac__click-order-board')
  const background = document.createElement('img')
  background.className = 'tac__click-order-background'
  background.alt = '验证码目标图'
  background.src = value.backgroundImage
  board.appendChild(background)

  const selected = []
  let submitting = false
  const message = createElement('div', 'tac__message')
  const confirm = createElement('button', 'tac__click-order-confirm', '确定')
  confirm.type = 'button'
  confirm.disabled = true
  const reset = () => {
    selected.splice(0, selected.length)
    board.querySelectorAll('.tac__click-order-target').forEach((item) => {
      item.classList.remove('selected')
      item.removeAttribute('data-order')
      item.setAttribute('aria-pressed', 'false')
    })
  }
  const submitSelection = () => {
    if (submitting || selected.length !== value.sequenceTargets.length) return
    submitting = true
    submit({ selectedIndexes: selected.slice() }, message, undefined, () => {
      submitting = false
      reset()
      confirm.disabled = true
    })
  }
  scope.bind(confirm, 'click', submitSelection)
  value.targets.forEach((target) => {
    const button = createElement('button', 'tac__click-order-target')
    button.type = 'button'
    button.setAttribute('aria-pressed', 'false')
    button.setAttribute('aria-label', `目标 ${target.index + 1}`)
    button.style.left = `${target.x}%`
    button.style.top = `${target.y}%`
    button.style.width = `${target.width}%`
    button.style.height = `${target.height}%`
    scope.bind(button, 'click', () => {
      if (submitting) return
      const position = selected.indexOf(target.index)
      if (position >= 0) selected.splice(position, 1)
      else if (selected.length < value.sequenceTargets.length) selected.push(target.index)
      else return
      board.querySelectorAll('.tac__click-order-target').forEach((item, index) => {
        const order = selected.indexOf(value.targets[index].index)
        item.classList.toggle('selected', order >= 0)
        item.setAttribute('aria-pressed', String(order >= 0))
        if (order >= 0) item.setAttribute('data-order', String(order + 1))
        else item.removeAttribute('data-order')
      })
      confirm.disabled = selected.length !== value.sequenceTargets.length
    })
    board.appendChild(button)
  })

  board.appendChild(message)
  const controls = createElement('div', 'tac__controls')
  controls.appendChild(confirm)
  root.append(board, controls)
}
