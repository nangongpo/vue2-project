import { createFooterButton, createElement, createScope, installStyle } from './dom.js'
import { STATES } from './constants.js'
import { CaptchaSdkError } from './errors.js'
import { normalizeChallenge, validateAnswer, validateOptions } from './validation.js'
import { renderLoading } from './renderers/loading.js'
import { renderLoadError } from './renderers/load-error.js'
import { renderChallenge } from './renderers/index.js'

export function createCaptcha(input) {
  const options = validateOptions(input)
  installStyle()
  const scope = createScope()
  let host = options.container
  let overlay = null
  let root = null
  let challenge = null
  let state = 'IDLE'
  let loading = false
  let loadGeneration = 0
  let destroyed = false
  let submitting = false
  let bodyElement = null
  let messageElement = null
  let previousFocus = null
  let expiresAt = 0
  let interactionStartedAt = null
  let expiryTimer = null
  const busy = (value) => {
    if (bodyElement) bodyElement.disabled = value
  }
  const showLoading = (active) => {
    if (!root) return
    root.setAttribute('aria-busy', String(active))
    root.querySelector('.tac__loading')?.remove()
    if (!active || options.mode !== 'POPUP') return
    const canvas = root.querySelector(
      '.tac__canvas,.tac__rotate-stage,.tac__grid,.tac__click-order-board,.tac__loading-canvas'
    )
    if (!canvas) return
    const mask = createElement('div', 'tac__loading')
    const spinner = createElement('span', 'tac__spinner')
    spinner.setAttribute('aria-hidden', 'true')
    mask.appendChild(spinner)
    if (canvas.classList.contains('tac__loading-canvas') && messageElement) mask.appendChild(messageElement)
    canvas.appendChild(mask)
  }
  const showMessage = (text, type) => {
    if (!messageElement) return
    messageElement.classList.remove('error', 'success')
    if (type) messageElement.classList.add(type)
    messageElement.textContent = text
  }
  const report = (error, display = true, phase = 'verify') => {
    transition('FAILED', { error })
    if (display) showMessage(error?.message || '验证码加载失败，请刷新重试', 'error')
    options.onFail?.(error, { phase })
  }

  const transition = (next, details) => {
    if (!STATES.includes(next)) throw new CaptchaSdkError('INVALID_STATE', `非法 SDK 状态 ${next}`)
    state = next
    options.onEvent?.({ Event: next, event: next, state: next, challenge, ...details })
  }
  const clear = () => {
    scope.clear()
    if (root) root.replaceChildren()
  }
  const mountRoot = () => {
    if (options.mode === 'EMBED') {
      host.replaceChildren()
      return host
    }
    if (!overlay) {
      previousFocus = document.activeElement
      overlay = createElement('div', 'tac__overlay')
      const dialog = createElement('div', 'tac__dialog')
      dialog.setAttribute('role', 'dialog')
      dialog.setAttribute('aria-modal', 'true')
      dialog.setAttribute('aria-label', '安全验证')
      dialog.tabIndex = -1
      overlay.appendChild(dialog)
      document.body.appendChild(overlay)
    }
    return overlay.querySelector('.tac__dialog')
  }
  const showLoadError = () => {
    if (options.mode !== 'POPUP' || !root || !bodyElement) return
    clearTimeout(expiryTimer)
    submitting = false
    interactionStartedAt = null
    root.setAttribute('aria-busy', 'false')
    const header = root.querySelector('.tac__head')
    header.replaceChildren(createElement('span', 'tac__title', '请稍后再试'))
    renderLoadError(bodyElement)
    bodyElement.disabled = false
    messageElement = null
  }
  const fail = (error) => {
    showLoadError()
    report(error, true, 'load')
    return Promise.reject(error)
  }
  const submit = (answer, message, onSuccess, onRetry) => {
    if (destroyed || loading || submitting || !challenge || ['EXPIRED', 'VERIFIED', 'CLOSED'].includes(state)) return
    let normalizedAnswer
    try {
      normalizedAnswer = validateAnswer(challenge, answer)
    } catch {
      message.className = 'tac__message error'
      message.textContent = '验证失败，请重新尝试！'
      interactionStartedAt = null
      onRetry?.()
      return
    }
    if (Date.now() >= expiresAt) {
      busy(true)
      report(new CaptchaSdkError('CHALLENGE_EXPIRED', '验证码已过期，请刷新'))
      return
    }
    const generation = loadGeneration
    const current = challenge
    const submittedAt = performance.now()
    const elapsedSeconds = Math.max(0, submittedAt - (interactionStartedAt ?? submittedAt)) / 1000
    submitting = true
    showMessage('正在验证…')
    busy(true)
    transition('SUBMITTING')
    Promise.resolve()
      .then(() => options.verify(normalizedAnswer, current))
      .then((result) => {
        if (destroyed || generation !== loadGeneration || current !== challenge) return
        submitting = false
        message.className = 'tac__message success'
        message.textContent = `验证成功，耗时 ${elapsedSeconds.toFixed(2)} 秒`
        onSuccess?.()
        transition('VERIFIED', { result })
        if (options.mode === 'POPUP') {
          const timer = setTimeout(() => {
            if (destroyed || generation !== loadGeneration || current !== challenge || state !== 'VERIFIED') return
            options.onSuccess?.(result)
            // The callback may open or replace the challenge. Never close that newer dialog.
            if (!destroyed && generation === loadGeneration && current === challenge) closeCaptcha()
          }, 2000)
          scope.cleanup(() => clearTimeout(timer))
        } else options.onSuccess?.(result)
      })
      .catch((error) => {
        if (destroyed || generation !== loadGeneration || current !== challenge) return
        submitting = false
        busy(false)
        message.className = 'tac__message error'
        message.textContent = '验证失败，请重新尝试！'
        interactionStartedAt = null
        onRetry?.()
        report(error, false)
      })
  }
  const render = (value) => {
    clear()
    root = mountRoot()
    root.classList.remove('tac__root--grid', 'tac__root--click-order', 'tac__root--slider')
    root.classList.add(
      value.captchaType === 'GRID_IMAGE_SELECT'
        ? 'tac__root--grid'
        : value.captchaType === 'CLICK_ORDER'
        ? 'tac__root--click-order'
        : 'tac__root--slider'
    )
    const header = createElement('div', 'tac__head')
    const titleText =
      value.captchaType === 'SIMPLE_SLIDER'
        ? value.payload.instruction || '请按住滑块，拖动到最左边'
        : value.captchaType === 'SLIDER'
        ? value.payload.instruction || '拖动滑块完成验证'
        : value.captchaType === 'GRID_IMAGE_SELECT'
        ? value.payload.prompt || `选择 ${value.payload.requiredCount} 个符合右图的图片`
        : value.captchaType === 'CLICK_ORDER'
        ? value.payload.prompt || '请按顺序点击目标'
        : value.captchaType === 'ROTATE'
        ? '旋转图片完成验证'
        : '完成验证'
    const title = createElement('span', 'tac__title', titleText)
    const headerTargets = createElement('div', 'tac__header-targets')
    headerTargets.style.display = 'flex'
    headerTargets.style.alignItems = 'center'
    headerTargets.style.justifyContent = 'flex-end'
    headerTargets.style.gap = '8px'
    if (value.captchaType === 'GRID_IMAGE_SELECT' && value.payload.targetImage) {
      const target = document.createElement('img')
      target.className = 'tac__header-target'
      target.src = value.payload.targetImage
      target.alt = '目标图标'
      headerTargets.appendChild(target)
    } else if (value.captchaType === 'CLICK_ORDER') {
      value.payload.sequenceTargets?.forEach((item, index) => {
        const target = document.createElement('img')
        target.className = 'tac__header-target'
        target.src = item.image
        target.alt = `第 ${index + 1} 个目标`
        headerTargets.appendChild(target)
      })
    }
    header.append(title, headerTargets)
    const body = createElement('fieldset', 'tac__body')
    bodyElement = body
    const footer = createElement('div', 'tac__footer')
    const footerActions = createElement('div', 'tac__footer-actions')
    const close = createFooterButton('close')
    close.type = 'button'
    close.setAttribute('aria-label', '关闭验证')
    const refresh = createFooterButton('refresh')
    refresh.type = 'button'
    refresh.setAttribute('aria-label', '刷新验证码')
    const vendor = createElement('span', 'tac__vendor', 'CAPTCHA')
    footerActions.append(refresh, close)
    footer.append(vendor, footerActions)
    root.append(header, body, footer)
    scope.bind(close, 'click', closeCaptcha)
    scope.bind(refresh, 'click', () => {
      refreshChallenge().catch(() => {})
    })
    interactionStartedAt = null
    const startInteraction = (event) => {
      if (loading || submitting || body.disabled || state === 'VERIFIED' || interactionStartedAt !== null) return
      if (
        event.type === 'keydown' &&
        !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', ' '].includes(event.key)
      )
        return
      interactionStartedAt = performance.now()
    }
    for (const event of ['pointerdown', 'keydown', 'click', 'input', 'change']) {
      // Capture before renderer handlers: auto-submit may happen in the same event.
      scope.bind(body, event, startInteraction, true)
    }
    renderChallenge(body, value, submit, scope)
    messageElement = body.querySelector('.tac__message')
    messageElement.setAttribute('role', 'status')
    messageElement.setAttribute('aria-live', 'polite')
    root.querySelectorAll('img').forEach((image) => {
      scope.bind(image, 'error', () => {
        if (loading || state === 'VERIFIED') return
        loadGeneration += 1
        showLoadError()
        report(new CaptchaSdkError('RESOURCE_LOAD_FAILED', '验证码图片加载失败，请刷新重试'), true, 'load')
      })
    })
    const timer = setTimeout(() => {
      if (state === 'VERIFIED') return
      loadGeneration += 1
      submitting = false
      busy(true)
      report(new CaptchaSdkError('CHALLENGE_EXPIRED', '验证码已过期，请刷新'))
    }, Math.max(0, expiresAt - Date.now()))
    expiryTimer = timer
    scope.cleanup(() => clearTimeout(timer))
    if (options.mode === 'POPUP') {
      scope.bind(root, 'keydown', (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          closeCaptcha()
          return
        }
        if (event.key !== 'Tab') return
        const nodes = [...root.querySelectorAll('button,input,[tabindex="0"]')].filter(
          (node) => !node.disabled && !node.closest('fieldset:disabled')
        )
        if (!nodes.length) {
          event.preventDefault()
          root.focus()
          return
        }
        const first = nodes[0],
          last = nodes.at(-1)
        if (event.shiftKey && (document.activeElement === first || document.activeElement === root)) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === root)) {
          event.preventDefault()
          first.focus()
        }
      })
      root.focus()
    }
    showLoading(false)
    transition('READY', { captchaType: value.captchaType })
  }
  const load = () => {
    if (destroyed) return Promise.reject(new CaptchaSdkError('DESTROYED', 'SDK 已销毁'))
    if (loading) return Promise.reject(new CaptchaSdkError('BUSY', '验证码正在加载'))
    clearTimeout(expiryTimer)
    const generation = ++loadGeneration
    submitting = false
    loading = true
    if (!root) {
      root = mountRoot()
      messageElement = createElement('div', 'tac__message tac__message--standalone', '正在加载验证码…')
      messageElement.setAttribute('role', 'status')
      messageElement.setAttribute('aria-live', 'polite')
      const close = createFooterButton('close')
      const refresh = createFooterButton('refresh')
      close.type = refresh.type = 'button'
      close.setAttribute('aria-label', '关闭验证')
      refresh.setAttribute('aria-label', '刷新验证码')
      if (options.mode === 'POPUP') {
        const header = createElement('div', 'tac__head', '安全验证')
        const body = createElement('fieldset', 'tac__body')
        bodyElement = body
        const canvas = createElement('div', 'tac__loading-canvas')
        canvas.appendChild(messageElement)
        body.append(canvas, createElement('div', 'tac__controls'))
        const footer = createElement('div', 'tac__footer')
        const actions = createElement('div', 'tac__footer-actions')
        actions.append(refresh, close)
        footer.append(createElement('span', 'tac__vendor', 'CAPTCHA'), actions)
        root.append(header, body, footer)
      } else root.append(messageElement, close, refresh)
      scope.bind(close, 'click', closeCaptcha)
      scope.bind(refresh, 'click', () => {
        refreshChallenge().catch(() => {})
      })
    }
    if (options.mode === 'POPUP') {
      root.querySelector('.tac__head').replaceChildren(createElement('span', 'tac__title', '安全验证'))
      messageElement = renderLoading(bodyElement)
    }
    busy(true)
    showLoading(true)
    transition('LOADING')
    showMessage('正在加载验证码…')
    const previous = challenge
    // Refreshes keep a stable animation duration even when the request is fast.
    // A slow request must finish before the old challenge is replaced.
    const minimumLoading =
      previous && options.mode === 'POPUP'
        ? new Promise((resolve) => {
            const timer = setTimeout(resolve, 500)
            scope.cleanup(() => {
              clearTimeout(timer)
              resolve()
            })
          })
        : Promise.resolve()
    const request = Promise.resolve()
      .then(() => options.loadChallenge(previous))
      .then(
        (response) => ({ ok: true, response }),
        (error) => ({ ok: false, error })
      )
    return Promise.all([request, minimumLoading])
      .then(([result]) => {
        if (!result.ok) throw result.error
        return result.response
      })
      .then((response) => {
        // A request that finished after close() must never repopulate the old
        // dialog or overwrite the Challenge from a newer open() call.
        if (generation !== loadGeneration || destroyed) return null
        challenge = normalizeChallenge(response, options.mode)
        expiresAt = Date.now() + challenge.expiresIn * 1000
        render(challenge)
        loading = false
        return challenge
      })
      .catch((error) => {
        if (generation !== loadGeneration || destroyed) return null
        loading = false
        showLoading(false)
        busy(false)
        return fail(error)
      })
  }
  function refreshChallenge() {
    return load()
  }
  function open() {
    if (options.mode === 'POPUP' && !overlay) transition('OPEN')
    return load()
  }
  function closeCaptcha() {
    // Invalidate an in-flight Challenge request before removing the dialog.
    // The next open() is therefore allowed to start a fresh request.
    loadGeneration += 1
    loading = false
    if (overlay?.parentNode) overlay.parentNode.removeChild(overlay)
    overlay = null
    clear()
    root = null
    challenge = null
    interactionStartedAt = null
    submitting = false
    bodyElement = null
    messageElement = null
    previousFocus?.focus?.()
    previousFocus = null
    if (host) host.replaceChildren()
    transition('CLOSED')
    options.onClose?.()
  }
  function destroy() {
    if (destroyed) return
    closeCaptcha()
    destroyed = true
    transition('DESTROYED')
  }
  const api = {
    open,
    refresh: refreshChallenge,
    close: closeCaptcha,
    getState: () => state,
    destroy,
    setChallenge(response) {
      if (destroyed) throw new CaptchaSdkError('DESTROYED', 'SDK 已销毁')
      const normalized = normalizeChallenge(response, options.mode)
      loadGeneration += 1
      loading = false
      submitting = false
      challenge = normalized
      expiresAt = Date.now() + challenge.expiresIn * 1000
      render(challenge)
      return api
    },
    mount(container) {
      if (options.mode !== 'EMBED') throw new CaptchaSdkError('INVALID_MODE', 'POPUP 模式不允许 mount')
      if (!container || typeof container.appendChild !== 'function')
        throw new CaptchaSdkError('INVALID_CONTAINER', 'container 无效')
      host = container
      if (challenge) render(challenge)
      return api
    },
  }
  return api
}
