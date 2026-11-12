import { afterEach, describe, expect, it, vi } from 'vitest'
import { installStyle } from '../../../captcha-service/sdk/dom.js'
import { createCaptcha } from '../../../captcha-service/sdk/core.js'

const challenge = {
  attemptId: 'attempt-123',
  challengeId: 'challenge-123',
  sceneId: 'login',
  captchaType: 'ROTATE',
  mode: 'POPUP',
  typeVersion: '1.0.0',
  resourceVersion: 'dev-1',
  expiresIn: 120,
  payload: {
    canvasWidth: 300,
    canvasHeight: 180,
    image: 'data:image/jpeg;base64,aGVsbG8=',
    minAngle: 0,
    maxAngle: 359,
    initialAngle: 0,
    rotationStep: 1,
  },
}

describe('captcha SDK event failures', () => {
  let sdk
  const refreshCaptcha = async () => {
    const pending = sdk.refresh()
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(500)
    return pending
  }
  afterEach(() => {
    sdk?.destroy()
    vi.useRealTimers()
  })

  it('rejects a simple slider on popup refresh before rendering it', async () => {
    const onFail = vi.fn()
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: vi
        .fn()
        .mockResolvedValueOnce(challenge)
        .mockResolvedValueOnce({
          ...challenge,
          captchaType: 'SIMPLE_SLIDER',
          payload: { trackWidth: 280, buttonWidth: 42 },
        }),
      verify: vi.fn(),
      onFail,
    })
    await sdk.open()
    await expect(sdk.refresh()).rejects.toThrow('验证码类型不支持该展示模式')
    expect(onFail).toHaveBeenCalledOnce()
    expect(document.querySelector('.tac__title').textContent).toBe('请稍后再试')
    expect(() => sdk.setChallenge({ ...challenge, mode: 'EMBED', captchaType: 'SIMPLE_SLIDER' })).toThrow(
      'Challenge 展示模式与 SDK 不一致'
    )
  })

  it('reports refresh failures without an unhandled rejection', async () => {
    const error = new Error('refresh failed')
    const onFail = vi.fn()
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: vi.fn().mockResolvedValueOnce(challenge).mockRejectedValueOnce(error),
      verify: vi.fn(),
      onFail,
    })
    await sdk.open()
    document.querySelector('[aria-label="刷新验证码"]').click()
    await vi.waitFor(() => expect(onFail).toHaveBeenCalledWith(error, expect.any(Object)))
    expect(sdk.getState()).toBe('FAILED')
  })

  it('keeps the retry image and footer visible when refresh is rate limited', async () => {
    const error = Object.assign(new Error('刷新过于频繁'), { code: 'RATE_LIMITED' })
    const onFail = vi.fn()
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: vi.fn().mockResolvedValueOnce(challenge).mockRejectedValueOnce(error),
      verify: vi.fn(),
      onFail,
    })
    await sdk.open()
    await expect(sdk.refresh()).rejects.toBe(error)
    expect(onFail).toHaveBeenCalledWith(error, { phase: 'load' })
    expect(document.querySelector('.tac__title').textContent).toBe('请稍后再试')
    expect(document.querySelector('.tac__load-error-canvas img').alt).toBe('请稍后再试')
    expect(document.querySelector('.tac__controls')).toBeNull()
    expect(document.querySelector('[aria-label="刷新验证码"]')).not.toBeNull()
    expect(document.querySelector('[aria-label="关闭验证"]')).not.toBeNull()
  })

  it('reports verify failures and displays the error without an unhandled rejection', async () => {
    const error = new Error('verify failed')
    const onFail = vi.fn()
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge: () => challenge, verify: () => Promise.reject(error), onFail })
    await sdk.open()
    document.querySelector('.tac__range').dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(onFail).toHaveBeenCalledWith(error, expect.any(Object)))
    expect(document.querySelector('.tac__message').textContent).toBe('验证失败，请重新尝试！')
    expect(document.querySelector('.tac__status')).toBeNull()
    expect(document.querySelectorAll('.tac__message')).toHaveLength(1)
    expect(sdk.getState()).toBe('FAILED')
  })

  it('shows success for two seconds before notifying and closing the popup', async () => {
    vi.useFakeTimers()
    const onSuccess = vi.fn()
    let resolveVerify
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () => challenge,
      verify: () =>
        new Promise((resolve) => {
          resolveVerify = resolve
        }),
      onSuccess,
    })
    await sdk.open()
    vi.advanceTimersByTime(5000) // Idle time before touching the control is excluded.
    document.querySelector('.tac__range').dispatchEvent(new Event('pointerdown', { bubbles: true }))
    vi.advanceTimersByTime(2500)
    document.querySelector('.tac__range').dispatchEvent(new Event('change', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(3000) // Network wait is excluded.
    resolveVerify({ verified: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(document.querySelector('.tac__message.success').textContent).toBe('验证成功，耗时 2.50 秒')
    expect(sdk.getState()).toBe('VERIFIED')
    expect(document.querySelector('.tac__body').disabled).toBe(true)
    expect(getComputedStyle(document.querySelector('.tac__body')).opacity).toBe('1')
    expect(getComputedStyle(document.querySelector('.tac__body')).pointerEvents).toBe('none')
    await vi.advanceTimersByTimeAsync(1999)
    expect(onSuccess).not.toHaveBeenCalled()
    expect(document.querySelector('.tac__overlay')).not.toBeNull()
    await vi.advanceTimersByTimeAsync(1)
    expect(onSuccess).toHaveBeenCalledOnce()
    expect(document.querySelector('.tac__overlay')).toBeNull()
  })

  it.each(['refresh', 'close', 'destroy'])('cancels delayed success after %s', async (action) => {
    vi.useFakeTimers()
    const onSuccess = vi.fn()
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () => challenge,
      verify: async () => ({ verified: true }),
      onSuccess,
    })
    await sdk.open()
    document.querySelector('.tac__range').dispatchEvent(new Event('change', { bubbles: true }))
    await vi.advanceTimersByTimeAsync(0)
    expect(sdk.getState()).toBe('VERIFIED')
    if (action === 'refresh') await refreshCaptcha()
    else sdk[action]()
    await vi.advanceTimersByTimeAsync(2000)
    expect(onSuccess).not.toHaveBeenCalled()
    if (action === 'refresh') {
      expect(sdk.getState()).toBe('READY')
      expect(document.querySelector('.tac__overlay')).not.toBeNull()
    }
  })

  it('replaces stale injected styles instead of keeping an old popup size', () => {
    const style = document.getElementById('captcha-sdk-style') || document.createElement('style')
    style.id = 'captcha-sdk-style'
    style.textContent = '.tac__dialog{height:470px}'
    if (!style.isConnected) document.head.appendChild(style)
    installStyle()
    expect(document.querySelectorAll('#captcha-sdk-style')).toHaveLength(1)
    const dialog = document.createElement('div')
    dialog.className = 'tac__dialog'
    document.body.appendChild(dialog)
    expect(getComputedStyle(dialog).width).toBe('318px')
    expect(getComputedStyle(dialog).height).toBe('318px')
    dialog.remove()
  })

  it('keeps refresh loading visible for at least 500ms', async () => {
    vi.useFakeTimers()
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge: () => challenge, verify: vi.fn() })
    await sdk.open()
    const pending = sdk.refresh()
    await vi.advanceTimersByTimeAsync(499)
    expect(document.querySelector('.tac__spinner')).not.toBeNull()
    expect(sdk.getState()).toBe('LOADING')
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(document.querySelector('.tac__spinner')).toBeNull()
    expect(sdk.getState()).toBe('READY')
  })

  it('keeps the popup shell and shows a spinner during refresh', async () => {
    let resolve
    const loadChallenge = vi
      .fn()
      .mockResolvedValueOnce(challenge)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge, verify: vi.fn() })
    await sdk.open()
    const dialog = document.querySelector('.tac__dialog')
    expect(getComputedStyle(dialog).height).toBe('318px')
    expect(getComputedStyle(document.querySelector('.tac__controls')).height).toBe('30px')
    expect(getComputedStyle(document.querySelector('.tac__controls')).marginTop).toBe('8px')
    expect(getComputedStyle(dialog).padding).toBe('8px')
    expect(getComputedStyle(dialog.querySelector('.tac__head')).height).toBe('44px')
    expect(getComputedStyle(dialog.querySelector('.tac__body')).height).toBe('218px')
    expect(getComputedStyle(dialog.querySelector('.tac__footer')).height).toBe('30px')
    expect(getComputedStyle(dialog.querySelector('.tac__footer')).marginTop).toBe('10px')
    const pending = sdk.refresh()
    await Promise.resolve()
    expect(document.querySelector('.tac__dialog')).toBe(dialog)
    expect(dialog.getAttribute('aria-busy')).toBe('true')
    expect(document.querySelector('.tac__loading-canvas')).not.toBeNull()
    expect(document.querySelector('.tac__loading>.tac__message')).not.toBeNull()
    expect(getComputedStyle(document.querySelector('.tac__loading')).gap).toBe('10px')
    expect(getComputedStyle(document.querySelector('.tac__loading>.tac__message')).position).toBe('static')
    expect(document.querySelector('.tac__rotate-image')).toBeNull()
    expect(document.querySelector('.tac__spinner')).not.toBeNull()
    resolve(challenge)
    await pending
    expect(document.querySelector('.tac__spinner')).toBeNull()
    expect(dialog.getAttribute('aria-busy')).toBe('false')
    expect(getComputedStyle(dialog).height).toBe('318px')
  })

  it('uses a single message for initial loading and loading failures', async () => {
    let reject
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () =>
        new Promise((_, fail) => {
          reject = fail
        }),
      verify: vi.fn(),
    })
    const pending = sdk.open()
    await Promise.resolve()
    expect(document.querySelector('.tac__status')).toBeNull()
    expect(document.querySelectorAll('.tac__message')).toHaveLength(1)
    expect(document.querySelector('.tac__message').textContent).toBe('正在加载验证码…')
    expect(document.querySelector('.tac__spinner')).not.toBeNull()
    expect(getComputedStyle(document.querySelector('.tac__dialog')).height).toBe('318px')
    reject(new Error('加载失败'))
    await expect(pending).rejects.toThrow('加载失败')
    expect(document.querySelector('.tac__title').textContent).toBe('请稍后再试')
    expect(document.querySelector('.tac__load-error-canvas img').alt).toBe('请稍后再试')
    expect(document.querySelector('.tac__controls')).toBeNull()
    expect(document.querySelector('.tac__spinner')).toBeNull()
  })

  it('renders the puzzle canvas and its piece', async () => {
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () => ({
        ...challenge,
        captchaType: 'SLIDER',
        payload: {
          canvasWidth: 300,
          canvasHeight: 180,
          trackWidth: 300,
          buttonWidth: 42,
          pieceSize: 44,
          targetY: 25,
          backgroundImage: 'background',
          puzzleImage: 'piece',
        },
      }),
      verify: vi.fn(),
    })
    await sdk.open()
    expect(document.querySelector('.tac__canvas .tac__background')).not.toBeNull()
    expect(document.querySelector('.tac__puzzle-slider .tac__button svg')).not.toBeNull()
    expect(getComputedStyle(document.querySelector('.tac__puzzle-slider .tac__button')).height).toBe('28px')
    expect(document.querySelector('.tac__slider-hint').textContent).toBe('向右拖动完成拼图')
    expect(parseFloat(document.querySelector('.tac__canvas .tac__piece').style.top)).toBeCloseTo((23 / 180) * 100)
  })

  it('renders simple sliders only inside the embed container and records leftward motion', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const verify = vi.fn().mockResolvedValue({ verified: true })
    sdk = createCaptcha({
      mode: 'EMBED',
      container,
      loadChallenge: () => ({
        ...challenge,
        mode: 'EMBED',
        captchaType: 'SIMPLE_SLIDER',
        payload: { trackWidth: 300, buttonWidth: 42 },
      }),
      verify,
    })
    await sdk.open()
    const button = container.querySelector('.tac__button')
    const track = container.querySelector('.tac__track')
    Object.defineProperty(track, 'clientWidth', { value: 300 })
    Object.defineProperty(button, 'offsetWidth', { value: 42 })
    expect(button.getAttribute('aria-valuenow')).toBe('258')
    expect(document.querySelector('.tac__overlay')).toBeNull()
    expect(container.querySelector('.tac__message')).not.toBeNull()
    vi.useFakeTimers()
    const pointer = (type, x) => {
      const event = new MouseEvent(type, { clientX: x, bubbles: true })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      button.dispatchEvent(event)
    }
    pointer('pointerdown', 258)
    for (let i = 1; i <= 10; i++) {
      vi.advanceTimersByTime(100)
      pointer('pointermove', 258 * (1 - i / 10))
    }
    pointer('pointerup', 0)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    vi.useRealTimers()
    expect(verify).toHaveBeenCalledOnce()
    const answer = verify.mock.calls[0][0]
    expect(answer.finalX).toBe(0)
    expect(answer.points[0].x).toBe(258)
    expect(answer.points.at(-1).x).toBe(0)
    container.remove()
  })

  it('rotates the image when the angle control changes', async () => {
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge: () => challenge, verify: vi.fn() })
    await sdk.open()
    const range = document.querySelector('.tac__range')
    range.value = '180'
    range.dispatchEvent(new Event('input', { bubbles: true }))
    expect(document.querySelector('.tac__rotate-image').style.transform).toBe('rotate(180deg)')
    expect(document.querySelector('.tac__controls button')).toBeNull()
  })

  it('selects, deselects and submits grid choices only once while busy', async () => {
    const verify = vi.fn(() => new Promise(() => {}))
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () => ({
        ...challenge,
        captchaType: 'GRID_IMAGE_SELECT',
        payload: {
          canvasWidth: 300,
          canvasHeight: 180,
          targetImage: 'target',
          requiredCount: 3,
          tiles: Array.from({ length: 9 }, (_, index) => ({ index, image: `tile-${index}` })),
        },
      }),
      verify,
    })
    await sdk.open()
    const tiles = document.querySelectorAll('.tac__tile')
    tiles[0].click()
    tiles[0].click()
    tiles[1].click()
    tiles[2].click()
    expect(verify).not.toHaveBeenCalled()
    tiles[4].click()
    tiles[5].click()
    await Promise.resolve()
    expect(verify).toHaveBeenCalledOnce()
    expect(verify.mock.calls[0][0]).toEqual({ selectedIndexes: [1, 2, 4] })
  })

  it('caps ordered choices and renumbers them after deselection', async () => {
    const verify = vi.fn().mockResolvedValue({ verified: true })
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () => ({
        ...challenge,
        captchaType: 'CLICK_ORDER',
        payload: {
          canvasWidth: 300,
          canvasHeight: 180,
          backgroundImage: 'background',
          sequenceTargets: [{ image: 'a' }, { image: 'b' }, { image: 'c' }],
          targets: Array.from({ length: 6 }, (_, index) => ({
            index,
            x: index * 10,
            y: 20,
            width: 10,
            height: 20,
            image: `target-${index}`,
          })),
        },
      }),
      verify,
    })
    await sdk.open()
    const buttons = document.querySelectorAll('.tac__click-order-target')
    buttons[0].click()
    buttons[1].click()
    buttons[2].click()
    buttons[3].click()
    expect(document.querySelectorAll('.tac__click-order-target.selected')).toHaveLength(3)
    buttons[1].click()
    expect(buttons[2].getAttribute('data-order')).toBe('2')
    buttons[4].click()
    document.querySelector('.tac__click-order-confirm').click()
    await Promise.resolve()
    expect(verify.mock.calls[0][0]).toEqual({ selectedIndexes: [0, 2, 4] })
  })

  it.each(['refresh', 'close', 'destroy'])('ignores pending verify responses after %s', async (action) => {
    let resolve
    const onSuccess = vi.fn()
    sdk = createCaptcha({
      mode: 'POPUP',
      loadChallenge: () => challenge,
      verify: () =>
        new Promise((done) => {
          resolve = done
        }),
      onSuccess,
    })
    await sdk.open()
    document.querySelector('.tac__range').dispatchEvent(new Event('change', { bubbles: true }))
    await Promise.resolve()
    if (action === 'refresh') await refreshCaptcha()
    else sdk[action]()
    resolve({ verified: true })
    await Promise.resolve()
    await Promise.resolve()
    expect(onSuccess).not.toHaveBeenCalled()
    if (action === 'refresh') expect(sdk.getState()).toBe('READY')
  })

  it('passes the previous challenge to the refresh callback', async () => {
    const loadChallenge = vi.fn().mockResolvedValue(challenge)
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge, verify: vi.fn() })
    await sdk.open()
    await refreshCaptcha()
    expect(loadChallenge.mock.calls[1][0]).toMatchObject({
      attemptId: challenge.attemptId,
      challengeId: challenge.challengeId,
    })
  })

  it('reports broken images and supports refreshing them', async () => {
    const onFail = vi.fn()
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge: () => challenge, verify: vi.fn(), onFail })
    await sdk.open()
    document.querySelector('.tac__rotate-image').dispatchEvent(new Event('error'))
    expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ code: 'RESOURCE_LOAD_FAILED' }), { phase: 'load' })
    expect(document.querySelector('.tac__load-error-canvas img').alt).toBe('请稍后再试')
    expect(document.querySelector('.tac__controls')).toBeNull()
    expect(document.querySelector('fieldset').disabled).toBe(false)
    await refreshCaptcha()
    expect(document.querySelector('fieldset').disabled).toBe(false)
  })

  it('expires challenges and prevents submission until refresh', async () => {
    vi.useFakeTimers()
    try {
      const verify = vi.fn(),
        onFail = vi.fn()
      sdk = createCaptcha({ mode: 'POPUP', loadChallenge: () => ({ ...challenge, expiresIn: 1 }), verify, onFail })
      await sdk.open()
      vi.advanceTimersByTime(1001)
      document.querySelector('.tac__range').dispatchEvent(new Event('change', { bubbles: true }))
      expect(verify).not.toHaveBeenCalled()
      expect(onFail).toHaveBeenCalledWith(expect.objectContaining({ code: 'CHALLENGE_EXPIRED' }), { phase: 'verify' })
      expect(document.querySelector('.tac__message.error').textContent).toBe('验证码已过期，请刷新')
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps public open and refresh failures rejectable by their callers', async () => {
    const error = new Error('load failed')
    sdk = createCaptcha({ mode: 'POPUP', loadChallenge: () => Promise.reject(error), verify: vi.fn() })
    await expect(sdk.open()).rejects.toBe(error)
    await expect(sdk.refresh()).rejects.toBe(error)
  })
})
