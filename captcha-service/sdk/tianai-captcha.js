/*
 * tianai-captcha 风格的原生 Web SDK。
 * 不依赖 Vue/Element UI，使用 mouse/touch 事件，兼容 Chrome 49。
 *
 * createTianaiCaptcha(container, { challenge, verify, onSuccess, onFail })
 */
var TianaiCaptcha = (function () {
  var styleId = 'tianai-captcha-sdk-style'

  function style() {
    if (document.getElementById(styleId)) return
    var node = document.createElement('style')
    node.id = styleId
    node.textContent = '.tac{width:100%;font:14px Arial,sans-serif;color:#8a99ad;user-select:none;-webkit-user-select:none}.tac__canvas{position:relative;width:100%;height:120px;overflow:hidden;background:#141c2e;border:1px solid #233554;box-sizing:border-box}.tac__background{display:block;width:100%;height:100%}.tac__piece{position:absolute;left:0;z-index:2;width:44px;height:44px;pointer-events:none}.tac__track{position:relative;height:42px;margin-top:8px;line-height:42px;background:#141c2e;border:1px solid #233554;box-sizing:border-box;text-align:center;overflow:hidden}.tac__progress{position:absolute;left:0;top:0;height:100%;width:0;background:linear-gradient(90deg,#12334d,#12617a,#00a8bd)}.tac__text{position:relative;z-index:3;color:#a9c7d6;font-weight:500;letter-spacing:.2px}.tac__button{position:absolute;z-index:4;left:0;top:0;width:42px;height:42px;margin-top:-1px;margin-left:-1px;border:1px solid #00f2fe;background:#00f2fe;color:#060913;line-height:42px;text-align:center;cursor:grab;box-sizing:border-box}.tac__button:active{cursor:grabbing}.tac__button.ok{background:#67c23a;border-color:#67c23a;color:#fff;cursor:default}.tac__message{height:18px;margin-top:4px;line-height:18px}.tac__message.error{color:#f56c6c}.tac__message.success{color:#67c23a}'
    document.head.appendChild(node)
  }

  function point(event) {
    var source = event.touches && event.touches.length ? event.touches[0] : event.changedTouches && event.changedTouches.length ? event.changedTouches[0] : event
    return { x: source.clientX, y: source.clientY }
  }

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    node.className = cls
    if (text) node.appendChild(document.createTextNode(text))
    return node
  }

  function create(container, options) {
    options = options || {}
    if (!container) throw new Error('captcha container is required')
    style()
    var root = el('div', 'tac')
    var canvas = el('div', 'tac__canvas')
    var background = document.createElement('img')
    background.className = 'tac__background'
    var piece = document.createElement('img')
    piece.className = 'tac__piece'
    var track = el('div', 'tac__track')
    var progress = el('div', 'tac__progress')
    var text = el('span', 'tac__text', options.text || '请按住滑块，拖动拼图到缺口')
    var button = el('span', 'tac__button', '→')
    var message = el('div', 'tac__message', '')
    canvas.appendChild(background); canvas.appendChild(piece)
    track.appendChild(progress); track.appendChild(text); track.appendChild(button)
    root.appendChild(canvas); root.appendChild(track); root.appendChild(message)
    container.innerHTML = ''; container.appendChild(root)
    var challenge = null; var dragging = false; var complete = false; var startX = 0; var startTime = 0; var left = 0; var points = []
    function emit(event, data) { var callback = options.OnEvent || options.onEvent; if (callback) callback(Object.assign({ Event: event, event: event }, data || {})) }

    function maxLeft() { return Math.max(0, track.clientWidth - button.offsetWidth) }
    function setLeft(value) {
      left = Math.max(0, Math.min(maxLeft(), value)); button.style.left = left + 'px'; progress.style.width = Math.min(track.clientWidth, left + button.offsetWidth) + 'px'; piece.style.left = left + 'px'
    }
    function messageText(value, type) { message.className = 'tac__message' + (type ? ' ' + type : ''); message.innerHTML = ''; if (value) message.appendChild(document.createTextNode(value)) }
    function record(p) { var rect = track.getBoundingClientRect(); points.push({ x: Math.round(left), y: Math.round(p.y - rect.top), t: Math.max(0, Date.now() - startTime) }) }
    function remove() { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', end); document.removeEventListener('touchmove', move); document.removeEventListener('touchend', end); document.removeEventListener('touchcancel', end) }
    function reset() { remove(); dragging = false; complete = false; button.className = 'tac__button'; button.textContent = '→'; setLeft(0); messageText('', '') }
    function fail(error) { remove(); dragging = false; complete = false; messageText(error && error.message ? error.message : '验证失败，请重新拖动', 'error'); var callback = options.OnFail || options.onFail; if (callback) callback(error); window.setTimeout(reset, 500) }
    function success(result) { complete = true; button.className = 'tac__button ok'; button.textContent = '✓'; messageText('验证通过', 'success'); var callback = options.OnSuccess || options.onSuccess; if (callback) callback(result) }
    function move(event) { if (!dragging) return; event.preventDefault(); var p = point(event); var rect = track.getBoundingClientRect(); setLeft(p.x - rect.left - startX); record(p) }
    function end(event) {
      if (!dragging) return
      event.preventDefault(); dragging = false; remove(); var p = point(event); var rect = track.getBoundingClientRect(); setLeft(p.x - rect.left - startX)
      var result = { points: points, finalX: Math.round(left), trackWidth: track.clientWidth, duration: points.length ? points[points.length - 1].t : 0 }
      var verify = options.Verify || options.verify
      var verification = verify ? verify(result) : Promise.resolve(result)
      Promise.resolve(verification).then(success).catch(fail)
    }
    function start(event) { if (complete || dragging) return; event.preventDefault(); var p = point(event); var rect = track.getBoundingClientRect(); startX = p.x - rect.left - left; dragging = true; startTime = Date.now(); points = []; record(p); document.addEventListener('mousemove', move); document.addEventListener('mouseup', end); document.addEventListener('touchmove', move, false); document.addEventListener('touchend', end, false); document.addEventListener('touchcancel', end, false) }
    function setChallenge(value) { var payload = value && value.Payload ? value.Payload : value; challenge = payload ? Object.assign({}, value, payload, { challengeId: value.ChallengeId || payload.challengeId, expiresIn: value.ExpiresIn || payload.expiresIn }) : null; reset(); if (!challenge) return; background.onload = function () { emit('RESOURCE_LOADED', { resource: 'background' }) }; background.onerror = function () { emit('RESOURCE_LOAD_FAILURE', { resource: 'background', reason: 'BACKGROUND_LOAD_FAILED' }) }; piece.onload = function () { emit('RESOURCE_LOADED', { resource: 'puzzle' }) }; piece.onerror = function () { emit('RESOURCE_LOAD_FAILURE', { resource: 'puzzle', reason: 'PUZZLE_LOAD_FAILED' }) }; background.src = challenge.backgroundImage; piece.src = challenge.puzzleImage; piece.style.width = (challenge.pieceSize || 44) + 'px'; piece.style.height = (challenge.pieceSize || 44) + 'px'; piece.style.top = (challenge.targetY || 0) + 'px'; messageText('', '') }
    button.addEventListener('mousedown', start); button.addEventListener('touchstart', start, false)
    if (options.Challenge || options.challenge) setChallenge(options.Challenge || options.challenge)
    function destroy() { remove(); button.removeEventListener('mousedown', start); button.removeEventListener('touchstart', start); container.innerHTML = '' }
    return { setChallenge: setChallenge, SetChallenge: setChallenge, reset: reset, Reset: reset, destroy: destroy, Destroy: destroy }
  }
  return { create: create }
}())

if (typeof window !== 'undefined') window.TianaiCaptcha = TianaiCaptcha
if (typeof module !== 'undefined' && module.exports) module.exports = TianaiCaptcha
export var createTianaiCaptcha = TianaiCaptcha.create
