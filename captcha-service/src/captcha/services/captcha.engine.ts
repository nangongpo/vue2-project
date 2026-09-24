import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { RedisService } from './redis.service.js'

export type CaptchaType = 'SLIDER'
export type CaptchaPoint = { x: number; y: number; t: number }
export type CaptchaEvent =
  | 'INIT_SUCCESS'
  | 'INIT_FAILURE'
  | 'RESOURCE_LOAD_FAILURE'
  | 'VERIFY_SUCCESS'
  | 'VERIFY_FAILURE'
  | 'TOKEN_CONSUME_SUCCESS'
  | 'TOKEN_CONSUME_FAILURE'
  | 'SERVICE_AUTH_FAILURE'
  | 'RATE_LIMITED'
export type SceneConfig = {
  allowedCaptchaTypes: CaptchaType[]
  defaultCaptchaType: CaptchaType
  allowedModes: ('EMBED' | 'POPUP')[]
  defaultMode: 'EMBED' | 'POPUP'
  ttl: number
  status: 'ACTIVE' | 'DEPRECATED' | 'RETIRED'
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
  typeVersion: string
  resourceVersion: string
  subjectHash: string
  ipHash: string
  userAgentHash: string
  deviceIdHash?: string
  canvasWidth: number
  canvasHeight: number
  trackWidth: number
  buttonWidth: number
  pieceSize: number
  targetX: number
  targetY: number
  createdAt: number
}
type Token = {
  prefix: string
  attemptId: string
  sceneId: string
  subjectHash: string
  ipHash: string
  deviceIdHash?: string
  issuedAt: number
}

/** SLIDER generator/validator. The answer is kept only in Redis and is never returned to the browser. */
export class CaptchaEngine {
  private readonly tokenTtl = Number(process.env.CAPTCHA_TOKEN_TTL || 120)
  private readonly maxPoints = Number(process.env.CAPTCHA_MAX_TRACK_POINTS || 300)
  private readonly canvasWidth = Number(process.env.CAPTCHA_CANVAS_WIDTH || 360)
  private readonly canvasHeight = Number(process.env.CAPTCHA_CANVAS_HEIGHT || 120)
  private readonly trackWidth = Number(process.env.CAPTCHA_TRACK_WIDTH || 360)
  private readonly buttonWidth = Number(process.env.CAPTCHA_BUTTON_WIDTH || 42)
  private readonly pieceSize = Number(process.env.CAPTCHA_PIECE_SIZE || 44)
  constructor(private readonly redis: RedisService) {}

  async createChallenge(
    binding: ServiceBinding,
    input: {
      attemptId: string
      sceneId: string
      captchaType?: CaptchaType
      mode?: 'EMBED' | 'POPUP'
      subject?: string
      clientIp?: string
      userAgent?: string
      deviceId?: string
    }
  ) {
    const scene = this.scene(binding, input.sceneId)
    const captchaType = input.captchaType || scene.defaultCaptchaType
    const mode = input.mode || scene.defaultMode
    if (!scene.allowedCaptchaTypes.includes(captchaType)) throw new CaptchaError('SCENE_NOT_FOUND', '验证码类型不被该场景允许')
    if (!scene.allowedModes.includes(mode)) throw new CaptchaError('SCENE_NOT_FOUND', '展示模式不被该场景允许')
    const ip = input.clientIp || 'unknown'
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
      typeVersion: 'SLIDER@1.0',
      resourceVersion: 'slider-default@4',
      subjectHash: this.hash(input.subject || ''),
      ipHash: this.hash(ip),
      userAgentHash: this.hash(input.userAgent || 'unknown'),
      deviceIdHash: input.deviceId ? this.hash(input.deviceId) : undefined,
      canvasWidth: this.canvasWidth,
      canvasHeight: this.canvasHeight,
      trackWidth: this.trackWidth,
      buttonWidth: this.buttonWidth,
      pieceSize: this.pieceSize,
      targetX: this.randomInt(Math.round(maxX * 0.45), Math.round(maxX * 0.88)),
      targetY: this.randomInt(18, this.canvasHeight - this.pieceSize - 10),
      createdAt: Date.now(),
    }
    if (!(await this.redis.set(this.challengeKey(binding.prefix, id), JSON.stringify(challenge), scene.ttl)))
      throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    const seed = this.hash(`${id}:${challenge.targetX}:${challenge.targetY}`).slice(0, 12)
    return {
      ChallengeId: id,
      SceneId: input.sceneId,
      CaptchaType: captchaType,
      Mode: mode,
      TypeVersion: challenge.typeVersion,
      ResourceVersion: challenge.resourceVersion,
      ExpiresIn: scene.ttl,
      Payload: {
        canvasWidth: this.canvasWidth,
        canvasHeight: this.canvasHeight,
        trackWidth: this.trackWidth,
        buttonWidth: this.buttonWidth,
        pieceSize: this.pieceSize,
        targetY: challenge.targetY,
        backgroundImage: this.dataUrl(this.background(seed, challenge)),
        puzzleImage: this.dataUrl(this.puzzle(seed, challenge)),
      },
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
      points: CaptchaPoint[]
      finalX: number
      trackWidth: number
    }
  ) {
    const verifyCount = await this.redis.increment(this.rateKey(binding.prefix, 'verify-ip', input.clientIp || 'unknown'), 60)
    if (verifyCount === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (verifyCount > Number(process.env.CAPTCHA_VERIFY_RATE_LIMIT || 30))
      throw new CaptchaError('RATE_LIMITED', '验证码请求过于频繁，请稍后重试', true)
    const raw = await this.redis.getAndDelete(this.challengeKey(binding.prefix, input.challengeId))
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
      Math.abs(c.trackWidth - input.trackWidth) <= 2
    if (!context) throw new CaptchaError('CONTEXT_MISMATCH', '验证码上下文不一致')
    if (Math.abs(input.finalX - c.targetX) > Math.max(6, Math.round(c.pieceSize * 0.18)))
      throw new CaptchaError('ANSWER_INVALID', '验证码答案错误')
    if (!this.human(input.points, input.finalX, c.trackWidth, c.buttonWidth))
      throw new CaptchaError('TRACK_INVALID', '验证码轨迹校验失败', true)
    const token = randomBytes(32).toString('base64url')
    const data: Token = {
      prefix: binding.prefix,
      attemptId: c.attemptId,
      sceneId: c.sceneId,
      subjectHash: c.subjectHash,
      ipHash: c.ipHash,
      deviceIdHash: c.deviceIdHash,
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
    }
  ) {
    const count = await this.redis.increment(this.rateKey(binding.prefix, 'consume-subject', input.subject || 'unknown'), 60)
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
        d.subjectHash === this.hash(input.subject || '') &&
        d.ipHash === this.hash(input.clientIp || 'unknown') &&
        (!d.deviceIdHash || d.deviceIdHash === this.hash(input.deviceId || ''))
      )
    } catch {
      return false
    }
  }
  async recordEvent(
    binding: ServiceBinding,
    i: {
      requestId: string
      eventId: string
      sceneId: string
      event: CaptchaEvent
      result?: string
      durationMs?: number
      reason?: string
    }
  ) {
    const count = await this.redis.increment(this.rateKey(binding.prefix, 'event', i.event), 60)
    if (count === null) throw new CaptchaError('SERVICE_UNAVAILABLE', '验证码服务暂不可用', true)
    if (count > Number(process.env.CAPTCHA_EVENT_RATE_LIMIT || 120))
      throw new CaptchaError('RATE_LIMITED', '事件上报过于频繁，请稍后重试', true)
    await this.redis.increment(
      `captcha:${process.env.NODE_ENV || 'development'}:${binding.prefix}:metric:${i.event}:${new Date().toISOString().slice(0, 10)}`,
      691200
    )
    console.info(
      JSON.stringify({
        service: 'captcha-service',
        eventId: i.eventId,
        requestId: i.requestId,
        prefix: binding.prefix,
        sceneId: i.sceneId,
        event: i.event,
        result: i.result,
        durationMs: Number.isFinite(i.durationMs) ? i.durationMs : undefined,
        reason: i.reason?.slice(0, 120),
        timestamp: new Date().toISOString(),
      })
    )
    return { Accepted: true }
  }

  private scene(b: ServiceBinding, id: string) {
    const s = b.scenes[id]
    if (!s) throw new CaptchaError('SCENE_NOT_FOUND', '业务场景不存在')
    if (s.status !== 'ACTIVE') throw new CaptchaError('SCENE_DISABLED', '业务场景已停用')
    return s
  }
  private human(points: CaptchaPoint[], finalX: number, width: number, button: number) {
    if (!Array.isArray(points) || points.length < 8 || points.length > this.maxPoints) return false
    const max = width - button
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
      forward >= max * 0.45 &&
      back <= max * 0.45 &&
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
      c.canvasWidth,
      c.canvasHeight,
      `<defs><linearGradient id="g"><stop stop-color="${colors[0]}"/><stop offset=".52" stop-color="${
        colors[1]
      }"/><stop offset="1" stop-color="${
        colors[2]
      }"/></linearGradient></defs><rect width="100%" height="100%" rx="8" fill="url(#g)"/><circle cx="${this.number(
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
        c.targetX,
        c.targetY,
        c.pieceSize
      )}" fill="#07111e" fill-opacity=".68" stroke="#fff" stroke-opacity=".8" stroke-width="2"/>`
    )
  }
  private puzzle(seed: string, c: Challenge) {
    // Keep the two-pixel stroke inside the SVG viewport. The path itself still
    // uses exactly the same coordinates as the hole in the background. The
    // client positions this padded image at (target - 2, targetY - 2), so the
    // path edges land on the hole edges instead of being scaled down.
    const padding = 2
    const path = this.path(padding, padding, c.pieceSize)
    return this.svg(
      c.pieceSize + padding * 2,
      c.pieceSize + padding * 2,
      `<path d="${path}" fill="${this.palette(seed)[1]}" stroke="#fff" stroke-width="2"/>`
    )
  }
  private path(x: number, y: number, s: number) {
    const n = Math.round(s * 0.18)
    return `M${x},${y}h${s * 0.38}c-${n},-${n} ${n * 2},-${n} ${s * 0.22},0h${s * 0.4}v${s * 0.34}c${n},-${n} ${n},${n * 2} 0,${n * 1.2}v${
      s * 0.44
    }h-${s * 0.42}c${n},${n} -${n * 2},-${n} -${n * 0.8},0h-${s * 0.38}v-${s * 0.42}c-${n},${n} -${n},-${n * 2} 0,-${n * 1.1}z`
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
}
