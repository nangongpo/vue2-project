import sharp from 'sharp'
import { CAPTCHA_CANVAS } from '#app/captcha/config/canvas.js'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { RedisService } from '#app/captcha/services/redis.service.js'
import { ResourceCatalog } from '#app/captcha/services/resource.catalog.js'

export type CaptchaType =
  | 'SIMPLE_SLIDER'
  | 'SLIDER'
  | 'ROTATE'
  | 'GRID_IMAGE_SELECT'
  | 'CLICK_ORDER'
  | 'TEXT_SELECT'
  | 'AUDIO'
export type CaptchaPoint = { x: number; y: number; t: number }
export type CaptchaAnswer = {
  finalX?: number
  finalAngle?: number
  selectedIndexes?: number[]
  selectedText?: string
  points?: CaptchaPoint[]
  trackWidth?: number
  interactions?: Array<Record<string, unknown>>
}
export type SceneConfig = {
  allowedCaptchaTypes: CaptchaType[]
  defaultCaptchaType: CaptchaType
  allowedModes: ('EMBED' | 'POPUP')[]
  defaultMode: 'EMBED' | 'POPUP'
  ttl: number
  status: 'ACTIVE' | 'DEPRECATED' | 'RETIRED'
  rotation?: {
    strategy?: 'WEIGHTED_RANDOM'
    avoidConsecutiveRepeat?: boolean
    weights?: Partial<Record<CaptchaType, number>>
  }
}
export type ServiceBinding = {
  serviceId: string
  secret: string
  prefix: string
  scenes: Record<string, SceneConfig>
  status: 'ACTIVE' | 'DISABLED'
}

export class CaptchaError extends Error {
  constructor(readonly code: string, message: string, readonly retryable = false) {
    super(message)
  }
}
type Challenge = {
  prefix: string
  attemptId: string
  sceneId: string
  captchaType: CaptchaType
  mode: 'EMBED' | 'POPUP'
  action: string
  typeVersion: string
  resourceVersion: string
  subjectHash: string
  ipHash: string
  userAgentHash: string
  deviceIdHash?: string
  canvasWidth?: number
  canvasHeight?: number
  trackWidth?: number
  buttonWidth?: number
  pieceSize?: number
  targetX?: number
  targetY?: number
  targetAngle?: number
  answerSet?: number[]
  requiredCount?: number
  prompt?: string
  createdAt: number
  verifyAttempts?: number
}
type Token = {
  prefix: string
  attemptId: string
  sceneId: string
  subjectHash: string
  ipHash: string
  deviceIdHash?: string
  captchaType: CaptchaType
  action: string
  issuedAt: number
}

/** SLIDER generator/validator. The answer is kept only in Redis and is never returned to the browser. */
export class CaptchaEngine {
  private readonly tokenTtl = Number(process.env.CAPTCHA_TOKEN_TTL || 120)
  private readonly maxPoints = Number(process.env.CAPTCHA_MAX_TRACK_POINTS || 300)
  // The SDK renders the challenge at its native dimensions. Keep the service
  // defaults aligned with the fixed 300x180 captcha canvas to avoid client-side
  // stretching and coordinate drift between the background and puzzle piece.
  private readonly canvasWidth = CAPTCHA_CANVAS.width
  private readonly canvasHeight = CAPTCHA_CANVAS.height
  private readonly trackWidth = Number(process.env.CAPTCHA_TRACK_WIDTH || 360)
  private readonly buttonWidth = Number(process.env.CAPTCHA_BUTTON_WIDTH || 42)
  private readonly pieceSize = Number(process.env.CAPTCHA_PIECE_SIZE || 44)
  private readonly resources = new ResourceCatalog()
  constructor(private readonly redis: RedisService) {}

  async createChallenge(
    binding: ServiceBinding,
    input: {
      attemptId: string
      sceneId: string
      captchaType?: CaptchaType
      mode?: 'EMBED' | 'POPUP'
      previousChallengeId?: string
      action?: string
      subject?: string
      clientIp?: string
      userAgent?: string
      deviceId?: string
    }
  ) {
    const scene = this.scene(binding, input.sceneId)
    const mode = input.mode || scene.defaultMode
    if (!scene.allowedModes.includes(mode)) throw new CaptchaError('SCENE_NOT_FOUND', '展示模式不被该场景允许')
    let allowedTypes = scene.allowedCaptchaTypes.filter((type) =>
      mode === 'EMBED' ? type === 'SIMPLE_SLIDER' : type !== 'SIMPLE_SLIDER'
    )
    if (input.previousChallengeId) {
      const previousRaw = await this.redis.get(this.challengeKey(binding.prefix, input.previousChallengeId))
      if (!previousRaw) throw new CaptchaError('CHALLENGE_EXPIRED', '验证码已过期，请重新发起验证', true)
      const previous = JSON.parse(previousRaw) as Challenge
      if (
        previous.attemptId !== input.attemptId ||
        previous.mode !== mode ||
        previous.sceneId !== input.sceneId ||
        previous.action !== (input.action || 'LOGIN') ||
        previous.subjectHash !== this.hash(input.subject || '') ||
        previous.ipHash !== this.hash(input.clientIp || 'unknown') ||
        previous.userAgentHash !== this.hash(input.userAgent || 'unknown')
      )
        throw new CaptchaError('CONTEXT_MISMATCH', '验证码刷新上下文不一致')
      if (scene.rotation?.avoidConsecutiveRepeat && !input.captchaType && allowedTypes.length > 1)
        allowedTypes = allowedTypes.filter((type) => type !== previous.captchaType)
    }
    if (!allowedTypes.length) throw new CaptchaError('SCENE_NOT_FOUND', '该展示模式没有可用验证码类型')
    const captchaType = input.captchaType || this.selectCaptchaType(scene, allowedTypes)
    if (!allowedTypes.includes(captchaType))
      throw new CaptchaError('SCENE_NOT_FOUND', '验证码类型不被该场景或展示模式允许')
    const ip = input.clientIp || 'unknown'
    const subject = input.subject || 'unknown'
    const cooldownSeconds = Number(process.env.CAPTCHA_FAILURE_COOLDOWN_SECONDS || 30)
    const cooldownKeys = [
      this.cooldownKey(binding.prefix, 'ip', ip),
      this.cooldownKey(binding.prefix, 'subject', subject.toLowerCase()),
    ]
    for (const key of cooldownKeys) {
      if (await this.redis.get(key))
        throw new CaptchaError('RATE_LIMITED', `验证码失败次数过多，请${cooldownSeconds}秒后重试`, true)
    }
    const count = await this.redis.increment(this.rateKey(binding.prefix, 'create-ip', ip), 60)
    if (count === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (count > Number(process.env.CAPTCHA_CHALLENGE_RATE_LIMIT || 10))
      throw new CaptchaError('RATE_LIMITED', '验证码请求过于频繁，请稍后重试', true)
    const id = randomUUID()
    // The answer is the left edge of the piece. Keep the complete piece inside
    // the image; the slider button is slightly narrower than the piece.
    const maxX = Math.min(this.trackWidth - this.buttonWidth, this.canvasWidth - this.pieceSize)
    const challenge: Challenge = {
      prefix: binding.prefix,
      attemptId: input.attemptId,
      sceneId: input.sceneId,
      captchaType,
      mode,
      action: input.action || 'LOGIN',
      typeVersion: `${captchaType}@${captchaType === 'ROTATE' ? '2.0' : '1.0'}`,
      resourceVersion: this.resourceVersion(captchaType),
      subjectHash: this.hash(input.subject || ''),
      ipHash: this.hash(ip),
      userAgentHash: this.hash(input.userAgent || 'unknown'),
      deviceIdHash: input.deviceId ? this.hash(input.deviceId) : undefined,
      createdAt: Date.now(),
    }
    if (captchaType === 'SIMPLE_SLIDER') {
      Object.assign(challenge, {
        trackWidth: this.trackWidth,
        buttonWidth: this.buttonWidth,
        targetX: 0,
      })
    } else if (captchaType === 'SLIDER') {
      Object.assign(challenge, {
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        trackWidth: this.trackWidth,
        buttonWidth: this.buttonWidth,
        pieceSize: this.pieceSize,
        targetX: this.randomInt(Math.round(maxX * 0.45), Math.round(maxX * 0.88)),
        targetY: this.randomInt(18, this.canvasHeight - this.pieceSize - 10),
      })
    } else if (captchaType === 'ROTATE') {
      Object.assign(challenge, { targetAngle: this.randomInt(35, 325) })
    } else if (captchaType === 'GRID_IMAGE_SELECT') {
      const answerSet = this.randomDistinctIndexes(9, 3)
      Object.assign(challenge, {
        answerSet,
        requiredCount: answerSet.length,
        prompt: `选择 ${answerSet.length} 个符合右图的图片`,
      })
    } else if (captchaType === 'CLICK_ORDER') {
      // CLICK_ORDER is an ordered sequence. Do not reuse the sorted set
      // helper used by GRID_IMAGE_SELECT, otherwise the question is never
      // actually testing order.
      const answerSet = this.randomOrderedIndexes(6, 3)
      Object.assign(challenge, { answerSet, requiredCount: answerSet.length, prompt: '请在下图依次点击' })
    } else {
      throw new CaptchaError('UNSUPPORTED_CAPTCHA_TYPE', '验证码类型暂不支持')
    }
    const seed = this.hash(`${id}:${challenge.targetX || 0}:${challenge.targetY || 0}`).slice(0, 12)
    const generatedPayload = await this.payload(captchaType, seed, challenge)
    const payload =
      captchaType === 'SIMPLE_SLIDER'
        ? generatedPayload
        : { ...generatedPayload, canvasWidth: CAPTCHA_CANVAS.width, canvasHeight: CAPTCHA_CANVAS.height }
    const published = await this.redis.publishChallenge(
      this.activeKey(binding.prefix, input.attemptId),
      this.challengeKey(binding.prefix, id),
      input.previousChallengeId ? this.challengeKey(binding.prefix, input.previousChallengeId) : '',
      JSON.stringify(challenge),
      scene.ttl
    )
    if (published === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (!published) throw new CaptchaError('CHALLENGE_EXPIRED', '验证码已刷新或失效，请重新加载', true)
    return {
      ChallengeId: id,
      SceneId: input.sceneId,
      CaptchaType: captchaType,
      Mode: mode,
      TypeVersion: challenge.typeVersion,
      ResourceVersion: challenge.resourceVersion,
      ExpiresIn: scene.ttl,
      Payload: payload,
    }
  }

  async verifyChallenge(
    binding: ServiceBinding,
    input: {
      attemptId: string
      challengeId: string
      sceneId: string
      subject?: string
      clientIp?: string
      userAgent?: string
      deviceId?: string
      action?: string
      captchaType?: CaptchaType
      answer?: CaptchaAnswer
      points?: CaptchaPoint[]
      finalX?: number
      trackWidth?: number
    }
  ) {
    const scene = this.scene(binding, input.sceneId)
    const verifyCount = await this.redis.increment(
      this.rateKey(binding.prefix, 'verify-ip', input.clientIp || 'unknown'),
      60
    )
    if (verifyCount === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (verifyCount > Number(process.env.CAPTCHA_VERIFY_RATE_LIMIT || 30))
      throw new CaptchaError('RATE_LIMITED', '验证码请求过于频繁，请稍后重试', true)
    const challengeKey = this.challengeKey(binding.prefix, input.challengeId)
    const raw = await this.redis.get(challengeKey)
    if (!raw) throw new CaptchaError('CHALLENGE_NOT_FOUND', '验证码挑战不存在或已被使用', true)
    let c: Challenge
    try {
      c = JSON.parse(raw) as Challenge
    } catch {
      throw new CaptchaError('CHALLENGE_EXPIRED', '验证码挑战已失效', true)
    }
    const context =
      c.attemptId === input.attemptId &&
      c.sceneId === input.sceneId &&
      c.subjectHash === this.hash(input.subject || '') &&
      c.ipHash === this.hash(input.clientIp || 'unknown') &&
      c.userAgentHash === this.hash(input.userAgent || 'unknown') &&
      (!c.deviceIdHash || c.deviceIdHash === this.hash(input.deviceId || '')) &&
      (!c.trackWidth || !input.trackWidth || Math.abs(c.trackWidth - input.trackWidth) <= 2) &&
      (!input.action || c.action === input.action) &&
      (!input.captchaType || c.captchaType === input.captchaType)
    if (c.createdAt + scene.ttl * 1000 <= Date.now()) throw new CaptchaError('CHALLENGE_EXPIRED', '验证码已过期', true)
    if (!context) {
      await this.redis.getAndDelete(challengeKey)
      throw new CaptchaError('CONTEXT_MISMATCH', '验证码上下文不一致')
    }
    const registerFailedAttempt = async (code: string, message: string) => {
      const attempts = await this.redis.incrementJsonField(
        challengeKey,
        'verifyAttempts',
        Number(process.env.CAPTCHA_VERIFY_ATTEMPT_LIMIT || 3)
      )
      if (attempts === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
      if (attempts < 0 || c.createdAt + scene.ttl * 1000 <= Date.now()) {
        await this.redis.getAndDelete(challengeKey)
        throw new CaptchaError('CHALLENGE_EXPIRED', '验证码挑战已失效，请重新获取', true)
      }
      if (attempts >= Number(process.env.CAPTCHA_VERIFY_ATTEMPT_LIMIT || 3)) {
        await this.redis.getAndDelete(challengeKey)
        const cooldownSeconds = Number(process.env.CAPTCHA_FAILURE_COOLDOWN_SECONDS || 30)
        const cooldownResults = await Promise.all([
          this.redis.set(this.cooldownKey(binding.prefix, 'ip', input.clientIp || 'unknown'), '1', cooldownSeconds),
          this.redis.set(
            this.cooldownKey(binding.prefix, 'subject', (input.subject || 'unknown').toLowerCase()),
            '1',
            cooldownSeconds
          ),
        ])
        if (cooldownResults.some((result) => !result))
          throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
        throw new CaptchaError('CHALLENGE_EXPIRED', `验证码尝试次数已用尽，请${cooldownSeconds}秒后重试`, true)
      }
      throw new CaptchaError(code, message, true)
    }
    const answer = input.answer || {
      points: input.points,
      finalX: input.finalX,
      trackWidth: input.trackWidth,
    }
    const answerResult = this.verifyAnswer(c, answer)
    if (!answerResult.valid) await registerFailedAttempt(answerResult.code, answerResult.message)
    if (!(await this.redis.consumeChallenge(this.activeKey(binding.prefix, c.attemptId), challengeKey, raw)))
      throw new CaptchaError('CHALLENGE_NOT_FOUND', '验证码挑战不存在或已被使用', true)
    const token = randomBytes(32).toString('base64url')
    const data: Token = {
      prefix: binding.prefix,
      attemptId: c.attemptId,
      sceneId: c.sceneId,
      subjectHash: c.subjectHash,
      ipHash: c.ipHash,
      deviceIdHash: c.deviceIdHash,
      captchaType: c.captchaType,
      action: c.action,
      issuedAt: Date.now(),
    }
    if (!(await this.redis.set(this.tokenKey(binding.prefix, token), JSON.stringify(data), this.tokenTtl)))
      throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    return { Verified: true, CaptchaToken: token, ExpiresIn: this.tokenTtl }
  }

  async consumeToken(
    binding: ServiceBinding,
    input: {
      attemptId: string
      token: string
      sceneId: string
      subject?: string
      clientIp?: string
      deviceId?: string
      action?: string
      captchaType?: CaptchaType
    }
  ) {
    const count = await this.redis.increment(
      this.rateKey(binding.prefix, 'consume-subject', input.subject || 'unknown'),
      60
    )
    if (count === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (count > Number(process.env.CAPTCHA_CONSUME_RATE_LIMIT || 30))
      throw new CaptchaError('RATE_LIMITED', '验证码请求过于频繁，请稍后重试', true)
    const raw = input.token ? await this.redis.getAndDelete(this.tokenKey(binding.prefix, input.token)) : null
    if (!raw) return false
    try {
      const d = JSON.parse(raw) as Token
      return (
        d.prefix === binding.prefix &&
        d.attemptId === input.attemptId &&
        d.sceneId === input.sceneId &&
        (!input.action || d.action === input.action) &&
        (!input.captchaType || d.captchaType === input.captchaType) &&
        d.subjectHash === this.hash(input.subject || '') &&
        d.ipHash === this.hash(input.clientIp || 'unknown') &&
        (!d.deviceIdHash || d.deviceIdHash === this.hash(input.deviceId || ''))
      )
    } catch {
      return false
    }
  }
  private scene(b: ServiceBinding, id: string) {
    const s = b.scenes[id]
    if (!s) throw new CaptchaError('SCENE_NOT_FOUND', '业务场景不存在')
    if (s.status !== 'ACTIVE') throw new CaptchaError('SCENE_DISABLED', '业务场景已停用')
    return s
  }
  private selectCaptchaType(scene: SceneConfig, allowedTypes: CaptchaType[]) {
    const fallback = allowedTypes.includes(scene.defaultCaptchaType) ? scene.defaultCaptchaType : allowedTypes[0]
    if (allowedTypes.length === 1 || !scene.rotation?.weights) return fallback
    const entries = allowedTypes.map(
      (type) => [type, Math.max(0, Number(scene.rotation?.weights?.[type] || 0))] as const
    )
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
    if (!total) return fallback
    let cursor = Math.random() * total
    for (const [type, weight] of entries) {
      cursor -= weight
      if (cursor < 0) return type
    }
    return fallback
  }
  private activeKey(prefix: string, attemptId: string) {
    return `captcha:${process.env.NODE_ENV || 'development'}:${prefix}:active:${attemptId}`
  }
  private resourceVersion(type: CaptchaType) {
    const published = this.resources.resourceVersion(type)
    if (published) return published
    if (type === 'ROTATE') return 'rotate-default@2'
    if (type === 'GRID_IMAGE_SELECT') return 'grid-default@1'
    if (type === 'SLIDER') return 'slider-default@4'
    return `${type.toLowerCase()}-default@1`
  }
  private verifyAnswer(c: Challenge, answer: CaptchaAnswer) {
    if (c.captchaType === 'SIMPLE_SLIDER') {
      const finalX = answer.finalX as number
      const trackWidth = answer.trackWidth as number
      if (
        !Number.isFinite(finalX) ||
        !Number.isFinite(trackWidth) ||
        !Number.isFinite(c.trackWidth) ||
        !Number.isFinite(c.buttonWidth) ||
        Math.abs(finalX - Number(c.targetX || 0)) > 6 ||
        Math.abs(trackWidth - Number(c.trackWidth)) > 2
      )
        return { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
      if (!this.human(answer.points || [], finalX, Number(c.trackWidth) - Number(c.buttonWidth), true))
        return { valid: false, code: 'TRACK_INVALID', message: '验证码轨迹校验失败' }
      return { valid: true, code: '', message: '' }
    }
    if (c.captchaType === 'SLIDER') {
      const finalX = answer.finalX as number
      if (
        !Number.isFinite(finalX) ||
        answer.trackWidth !== c.trackWidth ||
        Math.abs(finalX - Number(c.targetX || 0)) > Math.max(6, Math.round(Number(c.pieceSize || 44) * 0.18))
      )
        return { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
      if (
        !this.human(
          answer.points || [],
          finalX,
          Math.min(Number(c.trackWidth) - Number(c.buttonWidth), Number(c.canvasWidth) - Number(c.pieceSize)),
          false
        )
      )
        return { valid: false, code: 'TRACK_INVALID', message: '验证码轨迹校验失败' }
      return { valid: true, code: '', message: '' }
    }
    if (c.captchaType === 'ROTATE') {
      const angle = answer.finalAngle as number
      const target = Number(c.targetAngle)
      const distance = Math.abs(((angle - target + 540) % 360) - 180)
      return Number.isFinite(angle) && angle >= 0 && angle < 360 && distance <= 8
        ? { valid: true, code: '', message: '' }
        : { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
    }
    if (c.captchaType === 'GRID_IMAGE_SELECT') {
      if (!this.validIndexes(answer.selectedIndexes, 9, c.requiredCount || 3))
        return { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
      const selected = this.indexes(answer.selectedIndexes)
      const expected = this.indexes(c.answerSet)
      return selected.length === expected.length && selected.every((value, i) => value === expected[i])
        ? { valid: true, code: '', message: '' }
        : { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
    }
    if (c.captchaType === 'CLICK_ORDER') {
      if (!this.validIndexes(answer.selectedIndexes, 6, c.requiredCount || 3))
        return { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
      const selected = answer.selectedIndexes || []
      const expected = c.answerSet || []
      return selected.length === expected.length && selected.every((value, i) => value === expected[i])
        ? { valid: true, code: '', message: '' }
        : { valid: false, code: 'ANSWER_INVALID', message: '验证码答案错误' }
    }
    return { valid: false, code: 'UNSUPPORTED_CAPTCHA_TYPE', message: '验证码类型暂不支持' }
  }
  private validIndexes(values: unknown, size: number, count: number) {
    return (
      Array.isArray(values) &&
      values.length === count &&
      new Set(values).size === count &&
      values.every((value) => Number.isInteger(value) && value >= 0 && value < size)
    )
  }
  private indexes(values?: number[]) {
    return Array.isArray(values) && values.every((value) => Number.isInteger(value))
      ? [...new Set(values)].sort((a, b) => a - b)
      : []
  }
  private randomDistinctIndexes(size: number, count: number) {
    const values = Array.from({ length: size }, (_, index) => index)
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i)
      ;[values[i], values[j]] = [values[j], values[i]]
    }
    return values.slice(0, count).sort((a, b) => a - b)
  }
  private randomOrderedIndexes(size: number, count: number) {
    const values = this.randomDistinctIndexes(size, count)
    for (let i = values.length - 1; i > 0; i--) {
      const j = this.randomInt(0, i)
      ;[values[i], values[j]] = [values[j], values[i]]
    }
    return values
  }
  private async payload(type: CaptchaType, seed: string, c: Challenge) {
    if (type === 'SIMPLE_SLIDER')
      return {
        trackWidth: c.trackWidth,
        buttonWidth: c.buttonWidth,
        instruction: '请按住滑块，拖动到最左边',
      }
    if (type === 'SLIDER')
      return {
        canvasWidth: c.canvasWidth,
        canvasHeight: c.canvasHeight,
        trackWidth: c.trackWidth,
        buttonWidth: c.buttonWidth,
        pieceSize: c.pieceSize,
        targetY: c.targetY,
        backgroundImage: this.dataUrl(this.background(seed, c)),
        puzzleImage: this.dataUrl(this.puzzle(seed, c)),
      }
    if (type === 'ROTATE') {
      const source =
        this.resources.image('ROTATE', this.resourceGroup(seed, 'ROTATE')) || this.dataUrl(this.rotateImage(seed))
      // Bake the random offset into pixels. Neither the original image nor the
      // offset/answer is returned as SVG markup or metadata.
      const upright = await sharp(Buffer.from(source.split(',')[1], 'base64'))
        .resize(170, 170, { fit: 'cover' })
        .png()
        .toBuffer()
      const rotated = await sharp(upright)
        .rotate(360 - Number(c.targetAngle), { background: '#ffffff' })
        .png()
        .toBuffer()
      const image = await sharp(rotated).resize(170, 170, { fit: 'cover' }).png().toBuffer()
      return {
        image: `data:image/png;base64,${image.toString('base64')}`,
        rotationStep: 1,
        initialAngle: 0,
        minAngle: 0,
        maxAngle: 359,
      }
    }
    if (type === 'GRID_IMAGE_SELECT') {
      const targetGroup = this.resourceGroup(seed, 'GRID_IMAGE_SELECT')
      const groupCount = this.resources.groupCount('GRID_IMAGE_SELECT')
      const distractorGroup = (index: number) => {
        if (groupCount <= 1) return targetGroup
        return (targetGroup + 1 + (index % (groupCount - 1))) % groupCount
      }
      return {
        grid: { rows: 3, columns: 3 },
        prompt: c.prompt,
        targetImage: this.resources.gridTargetImage(targetGroup) || this.dataUrl(this.targetImage(seed, targetGroup)),
        requiredCount: c.requiredCount,
        tiles: Array.from({ length: 9 }, (_, index) => ({
          index,
          image:
            (c.answerSet?.includes(index)
              ? this.resources.gridImage(targetGroup, index)
              : this.resources.gridImage(distractorGroup(index), index)) ||
            this.dataUrl(this.tileImage(seed, index, Boolean(c.answerSet?.includes(index)), targetGroup)),
        })),
      }
    }
    if (type === 'CLICK_ORDER') {
      const positions = [
        [18, 22],
        [48, 24],
        [78, 22],
        [30, 66],
        [60, 63],
        [84, 66],
      ]
      const icons = await Promise.all(Array.from({ length: 6 }, (_, index) => this.clickOrderIcon(index)))
      const targets = Array.from({ length: 6 }, (_, index) => {
        const [centerX, centerY] = positions[index]
        return {
          index,
          x: centerX - 8,
          y: centerY - (48 / CAPTCHA_CANVAS.height) * 50,
          width: 16,
          height: (48 / CAPTCHA_CANVAS.height) * 100,
          image: this.dataUrl(icons[index]),
        }
      })
      return {
        prompt: c.prompt || '请在下图依次点击',
        backgroundImage: this.dataUrl(this.clickOrderBackground(seed, positions, icons)),
        sequenceTargets: (c.answerSet || []).map((index) => ({ image: targets[index].image })),
        targets,
      }
    }
    throw new CaptchaError('UNSUPPORTED_CAPTCHA_TYPE', '验证码类型暂不支持')
  }
  private human(points: CaptchaPoint[], finalX: number, max: number, leftward: boolean) {
    if (!Array.isArray(points) || points.length < 8 || points.length > this.maxPoints) return false
    if (!Number.isFinite(finalX) || finalX < 0 || finalX > max + 4) return false
    let p = points[0]
    let forward = 0
    let back = 0
    let changes = 0
    let intervals = 0
    let speed = 0
    if (!this.point(p, max)) return false
    for (let i = 1; i < points.length; i++) {
      const n = points[i]
      const dx = n.x - p.x
      const dt = n.t - p.t
      if (!this.point(n, max) || dt <= 0 || dt > 1500) return false
      const nextSpeed = Math.abs(dx) / dt
      if (intervals && Math.abs(nextSpeed - speed) > 0.08) changes++
      speed = nextSpeed
      intervals++
      if (dx >= 0) forward += dx
      else back += Math.abs(dx)
      p = n
    }
    const duration = p.t - points[0].t
    return (
      duration >= 280 &&
      duration <= 12000 &&
      intervals >= 5 &&
      Math.abs(p.x - finalX) <= 6 &&
      Math.abs(points[0].x - (leftward ? max : 0)) <= 6 &&
      (leftward ? back : forward) >= max * 0.2 &&
      (leftward ? forward : back) <= max * 0.25 &&
      (changes > 0 || duration >= 900)
    )
  }
  private point(p: CaptchaPoint, max: number) {
    return (
      Number.isFinite(p?.x) &&
      Number.isFinite(p?.y) &&
      Number.isFinite(p?.t) &&
      p.x >= -2 &&
      p.x <= max + 6 &&
      p.t >= 0 &&
      p.y >= -80 &&
      p.y <= 240
    )
  }
  private background(seed: string, c: Challenge) {
    const colors = this.palette(seed)
    return this.svg(
      Number(c.canvasWidth || this.canvasWidth),
      Number(c.canvasHeight || this.canvasHeight),
      `<defs><linearGradient id="g"><stop stop-color="${colors[0]}"/><stop offset=".52" stop-color="${
        colors[1]
      }"/><stop offset="1" stop-color="${
        colors[2]
      }"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${this.number(
        seed,
        0,
        40,
        320
      )}" cy="45" r="34" fill="#fff" fill-opacity=".12"/><circle cx="${this.number(
        seed,
        1,
        30,
        330
      )}" cy="125" r="46" fill="#000" fill-opacity=".12"/><path d="${this.path(
        Number(c.targetX || 0),
        Number(c.targetY || 0),
        Number(c.pieceSize || this.pieceSize)
      )}" fill="#07111e" fill-opacity=".68" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>`
    )
  }
  private puzzle(seed: string, c: Challenge) {
    // Keep the two-pixel stroke inside the SVG viewport. The path itself still
    // uses exactly the same coordinates as the hole in the background. The
    // client positions this padded image at (target - 2, targetY - 2), so the
    // path edges land on the hole edges instead of being scaled down.
    const padding = 2
    const path = this.path(padding, padding, Number(c.pieceSize || this.pieceSize))
    return this.svg(
      Number(c.pieceSize || this.pieceSize) + padding * 2,
      Number(c.pieceSize || this.pieceSize) + padding * 2,
      `<path d="${path}" fill="${this.palette(seed)[1]}" stroke="#fff" stroke-width="2"/>`
    )
  }
  private rotateImage(seed: string) {
    const colors = this.palette(seed)
    return this.svg(
      160,
      160,
      `<rect width="160" height="160" rx="18" fill="${colors[0]}"/><circle cx="80" cy="80" r="48" fill="${colors[1]}"/><path d="M80 24l32 38H94v62H66V62H48z" fill="#fff" fill-opacity=".85"/>`
    )
  }
  private targetImage(seed: string, group: number) {
    const colors = this.palette(seed)
    const motif = this.motif(group, 48, 48, 25)
    return this.svg(96, 96, `<rect width="96" height="96" rx="12" fill="${colors[2]}"/>${motif}`)
  }
  private clickOrderBackground(seed: string, positions: number[][], icons: string[]) {
    const colors = this.palette(seed)
    const symbols = positions
      .map(
        ([x, y], index) =>
          `<image x="${(x * CAPTCHA_CANVAS.width) / 100 - 16}" y="${
            (y * CAPTCHA_CANVAS.height) / 100 - 16
          }" width="32" height="32" href="${this.dataUrl(icons[index])}"/>`
      )
      .join('')
    return this.svg(
      CAPTCHA_CANVAS.width,
      CAPTCHA_CANVAS.height,
      `<g transform="scale(${CAPTCHA_CANVAS.width / 640} ${
        CAPTCHA_CANVAS.height / 360
      })"><defs><linearGradient id="city" x2="1" y2="1"><stop stop-color="#101936"/><stop offset=".55" stop-color="#273653"/><stop offset="1" stop-color="#7b4b3a"/></linearGradient></defs><rect width="640" height="360" fill="url(#city)"/><path d="M0 258h640v102H0z" fill="#121827"/><path d="M0 205h72v53H0zm91-72h82v125H91zm102 48h65v77h-65zm86-96h102v173H279zm123 58h76v115h-76zm98-57h86v172h-86z" fill="#0a1227" fill-opacity=".78"/><path d="M0 274h640M50 310h540" stroke="${
        colors[1]
      }" stroke-opacity=".35" stroke-width="2"/></g>${symbols}`
    )
  }
  private async clickOrderIcon(index: number) {
    // Measure painted pixels, not the nominal SVG canvas: each motif has a
    // different aspect ratio and some paths extend asymmetrically from (cx, cy).
    const source = this.svg(128, 128, this.clickOrderSymbol(index, 64, 64, 32))
    const { data, info } = await sharp(Buffer.from(source)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    let left = info.width,
      top = info.height,
      right = 0,
      bottom = 0
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        if (data[(y * info.width + x) * info.channels + info.channels - 1] < 16) continue
        left = Math.min(left, x)
        right = Math.max(right, x)
        top = Math.min(top, y)
        bottom = Math.max(bottom, y)
      }
    }
    const extent = Math.max(right - left + 1, bottom - top + 1) + 8
    const x = (left + right + 1 - extent) / 2
    const y = (top + bottom + 1 - extent) / 2
    return source
      .replace('viewBox="0 0 128 128"', `viewBox="${x} ${y} ${extent} ${extent}"`)
      .replace('width="128" height="128"', 'width="48" height="48"')
  }
  private clickOrderSymbol(index: number, cx: number, cy: number, size: number, stroke = '#38bdf8') {
    const common = `fill="none" stroke="${stroke}" stroke-width="${Math.max(
      3,
      size / 7
    )}" stroke-linecap="round" stroke-linejoin="round"`
    if (index === 0)
      return `<path d="M${cx - size} ${cy - size * 0.6}h${size * 1.5}a${size * 0.4} ${size * 0.4} 0 0 1 ${size * 0.4} ${
        size * 0.4
      }v${size * 0.8}a${size * 0.4} ${size * 0.4} 0 0 1 -${size * 0.4} ${size * 0.4}h-${size * 0.7}l-${size * 0.8} ${
        size * 0.7
      }v-${size * 0.7}h-${size * 0.0}a${size * 0.4} ${size * 0.4} 0 0 1 -${size * 0.4} -${size * 0.4}v-${size * 0.8}a${
        size * 0.4
      } ${size * 0.4} 0 0 1 ${size * 0.4} -${size * 0.4}z" ${common}/>`
    if (index === 1)
      return `<rect x="${cx - size}" y="${cy - size * 0.65}" width="${size * 2}" height="${size * 1.3}" rx="${
        size * 0.18
      }" ${common}/><circle cx="${cx}" cy="${cy}" r="${size * 0.42}" ${common}/><circle cx="${cx + size * 0.62}" cy="${
        cy - size * 0.38
      }" r="${size * 0.1}" fill="${stroke}"/>`
    if (index === 2)
      return `<path d="M${cx - size} ${cy - size * 0.55}h${size * 2}v${size * 1.1}h-${size * 2}zM${cx - size * 0.55} ${
        cy - size * 0.55
      }v-${size * 0.35}h${size * 1.1}v${size * 0.35}M${cx - size * 0.45} ${cy + size * 0.55}v${size * 0.55}m${
        size * 0.9
      } -${size * 0.55}v${size * 0.55}" ${common}/>`
    if (index === 3)
      return `<path d="M${cx - size * 0.75} ${cy - size * 0.1}q0 -${size * 0.9} ${size * 0.75} -${size * 0.9}t${
        size * 0.75
      } ${size * 0.9}v${size * 0.85}h-${size * 1.5}zM${cx - size * 0.4} ${cy + size * 0.75}h${size * 0.8}" ${common}/>`
    if (index === 4)
      return `<path d="M${cx} ${cy - size}l${size * 0.9} ${size * 0.9}-${size * 0.9} ${size * 0.9}-${size * 0.9} -${
        size * 0.9
      }zM${cx} ${cy - size * 0.45}v${size * 0.95}" ${common}/><circle cx="${cx}" cy="${cy + size * 0.7}" r="${
        size * 0.12
      }" fill="${stroke}"/>`
    return `<path d="M${cx - size} ${cy + size * 0.55}q${size * 0.5} -${size * 1.6} ${size} 0t${size} 0M${cx - size} ${
      cy - size * 0.2
    }q${size * 0.5} -${size * 1.6} ${size} 0t${size} 0" ${common}/>`
  }
  private tileImage(seed: string, index: number, match: boolean, group: number) {
    const colors = this.palette(`${seed}${index}`)
    const fill = colors[index % colors.length]
    const mark = this.motif(match ? group : (group + index + 1) % 3, 48, 48, 18 + (index % 3) * 3)
    return this.svg(96, 96, `<rect width="96" height="96" rx="12" fill="${fill}"/>${mark}`)
  }
  private resourceGroup(seed: string, type: 'GRID_IMAGE_SELECT' | 'CLICK_ORDER' | 'ROTATE' = 'GRID_IMAGE_SELECT') {
    const count = Math.max(1, this.resources.groupCount(type) || 4)
    return this.number(seed, 5, 0, count - 1)
  }
  private motif(group: number, cx: number, cy: number, size: number) {
    if (group === 0)
      return `<circle cx="${cx}" cy="${cy}" r="${size}" fill="#facc15"/><circle cx="${cx - size / 3}" cy="${
        cy - size / 4
      }" r="${Math.max(3, size / 5)}" fill="#fff" fill-opacity=".82"/>`
    if (group === 1)
      return `<rect x="${cx - size}" y="${cy - size}" width="${size * 2}" height="${size * 2}" rx="${Math.max(
        4,
        size / 3
      )}" fill="#fb7185"/><path d="M${cx - size / 2} ${cy}h${size}M${cx} ${
        cy - size / 2
      }v${size}" stroke="#fff" stroke-width="${Math.max(3, size / 5)}"/>`
    return `<path d="M${cx} ${cy - size}l${size} ${size * 2}h-${size * 2}z" fill="#38bdf8"/><circle cx="${cx}" cy="${
      cy + size / 3
    }" r="${Math.max(3, size / 5)}" fill="#fff" fill-opacity=".82"/>`
  }
  private path(x: number, y: number, s: number) {
    const n = Math.round(s * 0.18)
    return `M${x},${y}h${s * 0.38}c-${n},-${n} ${n * 2},-${n} ${s * 0.22},0h${s * 0.4}v${s * 0.34}c${n},-${n} ${n},${
      n * 2
    } 0,${n * 1.2}v${s * 0.44}h-${s * 0.42}c${n},${n} -${n * 2},-${n} -${n * 0.8},0h-${s * 0.38}v-${
      s * 0.42
    }c-${n},${n} -${n},-${n * 2} 0,-${n * 1.1}z`
  }
  private svg(w: number, h: number, body: string) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`
  }
  private dataUrl(svg: string) {
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  }
  private palette(seed: string) {
    const p = [
      ['#075985', '#0891b2', '#164e63'],
      ['#3730a3', '#2563eb', '#0f766e'],
      ['#9f1239', '#c2410c', '#7c2d12'],
      ['#166534', '#0f766e', '#155e75'],
    ]
    return p[parseInt(seed.slice(0, 2), 16) % p.length]
  }
  private number(seed: string, o: number, min: number, max: number) {
    return min + (parseInt(seed.slice(o * 2, o * 2 + 2), 16) % (max - min + 1))
  }
  private randomInt(min: number, max: number) {
    return min + Math.floor(Math.random() * Math.max(1, max - min + 1))
  }
  private hash(v: string) {
    return createHash('sha256').update(v).digest('hex')
  }
  private challengeKey(prefix: string, id: string) {
    return `captcha:${process.env.NODE_ENV || 'development'}:${prefix}:challenge:${id}`
  }
  private tokenKey(prefix: string, token: string) {
    return `captcha:${process.env.NODE_ENV || 'development'}:${prefix}:token:${this.hash(token)}`
  }
  private rateKey(prefix: string, dimension: string, value: string) {
    return `captcha:${process.env.NODE_ENV || 'development'}:${prefix}:rate:${dimension}:${this.hash(value)}`
  }
  private cooldownKey(prefix: string, dimension: string, value: string) {
    return `captcha:${process.env.NODE_ENV || 'development'}:${prefix}:cooldown:${dimension}:${this.hash(value)}`
  }
}
