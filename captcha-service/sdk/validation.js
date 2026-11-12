import { CAPTCHA_CANVAS, CAPTCHA_TYPES, MODES } from './constants.js'
import { fail } from './errors.js'

// Published image files may be up to 2 MiB. The catalog sends them as
// Base64 data URLs, which need four characters for every three bytes.
const MAX_IMAGE_STRING_LENGTH = 4 * Math.ceil((2 * 1024 * 1024) / 3) + 128

const object = (value, name) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PARAMETER', `${name} 必须是对象`)
  return value
}
const requiredString = (value, name, max = 128) => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max)
    fail('INVALID_PARAMETER', `${name} 必须是有效字符串`)
  return value
}
const requiredFunction = (value, name) => {
  if (typeof value !== 'function') fail('INVALID_PARAMETER', `${name} 必须是函数`)
  return value
}

export function validateOptions(input) {
  const options = object(input, 'options')
  if (!MODES.includes(options.mode)) fail('INVALID_MODE', 'mode 必须明确指定为 EMBED 或 POPUP')
  requiredFunction(options.loadChallenge, 'loadChallenge')
  requiredFunction(options.verify, 'verify')
  if (options.mode === 'EMBED' && (!options.container || typeof options.container.appendChild !== 'function'))
    fail('INVALID_CONTAINER', 'EMBED 模式必须提供有效 container')
  if (options.mode === 'POPUP' && options.container !== undefined)
    fail('INVALID_PARAMETER', 'POPUP 模式不允许传入 container')
  return options
}

export function validateChallengeEnvelope(input, expectedMode) {
  const value = object(input, 'challenge')
  // attemptId is the backend-owned flow handle required by the verify API.
  // It must travel with the normalized Challenge; dropping it causes the
  // browser to submit an undefined attemptId and fail DTO validation.
  requiredString(value.attemptId, 'attemptId', 64)
  requiredString(value.challengeId, 'challengeId')
  requiredString(value.sceneId, 'sceneId', 64)
  requiredString(value.captchaType, 'captchaType', 32)
  requiredString(value.mode, 'mode', 16)
  requiredString(value.typeVersion, 'typeVersion', 32)
  requiredString(value.resourceVersion, 'resourceVersion', 64)
  if (!MODES.includes(value.mode) || !CAPTCHA_TYPES.includes(value.captchaType))
    fail('INVALID_CHALLENGE', 'Challenge 类型或模式不受支持')
  if (expectedMode !== undefined && value.mode !== expectedMode)
    fail('INVALID_CHALLENGE', 'Challenge 展示模式与 SDK 不一致')
  if (value.mode === 'EMBED' ? value.captchaType !== 'SIMPLE_SLIDER' : value.captchaType === 'SIMPLE_SLIDER')
    fail('INVALID_CHALLENGE', '验证码类型不支持该展示模式')
  if (!Number.isInteger(value.expiresIn) || value.expiresIn <= 0 || value.expiresIn > 900)
    fail('INVALID_CHALLENGE', 'Challenge 有效期无效')
  const payload = object(value.payload, 'challenge.payload')
  if (
    value.captchaType !== 'SIMPLE_SLIDER' &&
    (payload.canvasWidth !== CAPTCHA_CANVAS.width || payload.canvasHeight !== CAPTCHA_CANVAS.height)
  )
    fail('INVALID_CHALLENGE', '弹窗验证码画布必须为 300 × 180 px')
  const positive = (key, max = 4096) => {
    if (!Number.isFinite(payload[key]) || payload[key] <= 0 || payload[key] > max)
      fail('INVALID_CHALLENGE', `Payload 的 ${key} 无效`)
  }
  const image = (value, name) => requiredString(value, name, MAX_IMAGE_STRING_LENGTH)
  const indexes = (items, size) =>
    Array.isArray(items) &&
    items.length === size &&
    items.every(
      (item, i) =>
        item &&
        Number.isInteger(item.index) &&
        item.index >= 0 &&
        item.index < size &&
        items.findIndex((other) => other?.index === item.index) === i
    )
  if (value.captchaType === 'SIMPLE_SLIDER' || value.captchaType === 'SLIDER') {
    positive('trackWidth')
    positive('buttonWidth')
    if (payload.buttonWidth >= payload.trackWidth) fail('INVALID_CHALLENGE', '滑块宽度必须小于轨道宽度')
    if (value.captchaType === 'SLIDER') {
      positive('canvasWidth')
      positive('canvasHeight')
      positive('pieceSize')
      if (
        payload.pieceSize >= payload.canvasWidth ||
        !Number.isFinite(payload.targetY) ||
        payload.targetY < 0 ||
        payload.targetY + payload.pieceSize > payload.canvasHeight
      )
        fail('INVALID_CHALLENGE', '拼图坐标无效')
      image(payload.backgroundImage, 'slider.backgroundImage')
      image(payload.puzzleImage, 'slider.puzzleImage')
    }
  } else if (value.captchaType === 'ROTATE') {
    image(payload.image, 'rotate.image')
    if (
      ![payload.minAngle, payload.maxAngle, payload.initialAngle, payload.rotationStep].every(Number.isFinite) ||
      payload.minAngle !== 0 ||
      payload.maxAngle !== 359 ||
      payload.initialAngle < 0 ||
      payload.initialAngle > 359 ||
      payload.rotationStep <= 0 ||
      payload.rotationStep > 359
    )
      fail('INVALID_CHALLENGE', '旋转角度范围无效')
  } else if (value.captchaType === 'GRID_IMAGE_SELECT') {
    image(payload.targetImage, 'grid.targetImage')
    if (
      !indexes(payload.tiles, 9) ||
      !Number.isInteger(payload.requiredCount) ||
      payload.requiredCount < 1 ||
      payload.requiredCount > 9
    )
      fail('INVALID_CHALLENGE', '九宫格 Payload 不完整')
    payload.tiles.forEach((tile) => image(tile.image, 'grid.tile.image'))
  } else if (value.captchaType === 'CLICK_ORDER') {
    image(payload.backgroundImage, 'clickOrder.backgroundImage')
    if (
      !indexes(payload.targets, 6) ||
      !Array.isArray(payload.sequenceTargets) ||
      payload.sequenceTargets.length < 3 ||
      payload.sequenceTargets.length > 6
    )
      fail('INVALID_CHALLENGE', '点击顺序 Payload 不完整')
    payload.sequenceTargets.forEach((target) => image(target?.image, 'clickOrder.sequenceTarget.image'))
    payload.targets.forEach((target) => {
      if (
        ![target.x, target.y, target.width, target.height].every(Number.isFinite) ||
        target.x < 0 ||
        target.y < 0 ||
        target.width <= 0 ||
        target.height <= 0 ||
        target.x + target.width > 100 ||
        target.y + target.height > 100
      )
        fail('INVALID_CHALLENGE', '点击目标坐标无效')
      image(target.image, 'clickOrder.target.image')
    })
  }
  return value
}

export function normalizeChallenge(input, expectedMode) {
  const value = object(input, 'challenge response')
  const payload = value.Payload || value.payload
  const normalized = {
    attemptId: value.AttemptId || value.attemptId,
    challengeId: value.ChallengeId || value.challengeId,
    sceneId: value.SceneId || value.sceneId,
    captchaType: value.CaptchaType || value.captchaType,
    mode: value.Mode || value.mode,
    typeVersion: value.TypeVersion || value.typeVersion,
    resourceVersion: value.ResourceVersion || value.resourceVersion,
    expiresIn: value.ExpiresIn || value.expiresIn,
    payload,
  }
  return validateChallengeEnvelope(normalized, expectedMode)
}

export function validateAnswer(challenge, answer) {
  const value = object(answer, 'answer')
  if (challenge.captchaType === 'SIMPLE_SLIDER' || challenge.captchaType === 'SLIDER') {
    if (
      !Array.isArray(value.points) ||
      value.points.length < 8 ||
      value.points.length > 300 ||
      value.points.some((point) => !point || ![point.x, point.y, point.t].every(Number.isFinite)) ||
      !Number.isFinite(value.finalX) ||
      value.finalX < 0 ||
      value.trackWidth !== challenge.payload.trackWidth
    )
      fail('INVALID_ANSWER', '滑块答案不完整')
  } else if (challenge.captchaType === 'ROTATE') {
    if (!Number.isFinite(value.finalAngle) || value.finalAngle < 0 || value.finalAngle > 359)
      fail('INVALID_ANSWER', '旋转角度不能为空')
  } else if (challenge.captchaType === 'GRID_IMAGE_SELECT' || challenge.captchaType === 'CLICK_ORDER') {
    const count =
      challenge.captchaType === 'GRID_IMAGE_SELECT'
        ? challenge.payload.requiredCount
        : challenge.payload.sequenceTargets.length
    const size = challenge.captchaType === 'GRID_IMAGE_SELECT' ? 9 : challenge.payload.targets.length
    if (
      !Array.isArray(value.selectedIndexes) ||
      value.selectedIndexes.length !== count ||
      new Set(value.selectedIndexes).size !== count ||
      !value.selectedIndexes.every((index) => Number.isInteger(index) && index >= 0 && index < size)
    )
      fail('INVALID_ANSWER', '选择答案不完整')
  }
  return value
}
