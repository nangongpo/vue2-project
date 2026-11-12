import { createElement } from '../dom.js'

const failureImage = new URL('../assets/load-failed.svg', import.meta.url).href

export function renderLoadError(root) {
  const canvas = createElement('div', 'tac__canvas tac__load-error-canvas')
  const image = document.createElement('img')
  image.className = 'tac__background'
  image.src = failureImage
  image.alt = '请稍后再试'
  image.width = 300
  image.height = 180
  canvas.appendChild(image)
  root.replaceChildren(canvas)
}
