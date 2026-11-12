import { createElement } from '../dom.js'

export function renderGrid(root, challenge, submit, scope) {
  const value = challenge.payload
  const panel = createElement('div', 'tac__panel tac__grid-panel')
  const grid = createElement('div', 'tac__grid')
  const selected = []
  const message = createElement('div', 'tac__message')
  let submitting = false
  const resetSelection = () => {
    selected.splice(0, selected.length)
    grid.querySelectorAll('.tac__tile').forEach((item) => {
      item.classList.remove('selected')
      item.setAttribute('aria-pressed', 'false')
    })
  }
  const submitSelection = () => {
    if (submitting || selected.length !== value.requiredCount) return
    submitting = true
    submit({ selectedIndexes: selected.slice() }, message, undefined, () => {
      submitting = false
      resetSelection()
    })
  }
  value.tiles.forEach((tile) => {
    const button = createElement('button', 'tac__tile')
    button.type = 'button'
    button.setAttribute('aria-label', `第 ${tile.index + 1} 张图片`)
    button.setAttribute('aria-pressed', 'false')
    const image = document.createElement('img')
    image.alt = ''
    image.src = tile.image
    button.appendChild(image)
    scope.bind(button, 'click', () => {
      if (submitting) return
      const position = selected.indexOf(tile.index)
      if (position >= 0) {
        selected.splice(position, 1)
        button.classList.remove('selected')
        button.setAttribute('aria-pressed', 'false')
      } else if (selected.length < value.requiredCount) {
        selected.push(tile.index)
        button.classList.add('selected')
        button.setAttribute('aria-pressed', 'true')
      }
      submitSelection()
    })
    grid.appendChild(button)
  })
  grid.appendChild(message)
  panel.append(grid, createElement('div', 'tac__controls'))
  root.appendChild(panel)
}
