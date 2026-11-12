import { afterEach, describe, expect, it, vi } from 'vitest'
import sharp from 'sharp'
import { ResourceCatalog } from '#app/captcha/services/resource.catalog.js'
import { CaptchaEngine, ServiceBinding, CaptchaType } from '#app/captcha/services/captcha.engine.js'
class MemoryRedis {
  values = new Map<string, string>()
  async increment() {
    return 1
  }
  async set(k: string, v: string) {
    this.values.set(k, v)
    return true
  }
  async get(k: string) {
    return this.values.get(k) || null
  }
  async getAndDelete(k: string) {
    const v = this.values.get(k) || null
    this.values.delete(k)
    return v
  }
  async getAndDeleteIfValue(k: string, expected: string) {
    const v = this.values.get(k) || null
    if (v !== expected) return null
    this.values.delete(k)
    return v
  }
  async publishChallenge(active: string, key: string, previous: string, value: string) {
    const current = this.values.get(active)
    if (previous ? current !== previous : Boolean(current)) return false
    if (previous) this.values.delete(previous)
    this.values.set(key, value)
    this.values.set(active, key)
    return true
  }
  async consumeChallenge(active: string, key: string, raw: string) {
    if (this.values.get(active) !== key || this.values.get(key) !== raw) return null
    this.values.delete(active)
    this.values.delete(key)
    return raw
  }
  async incrementJsonField(k: string, field: string, max: number) {
    const raw = this.values.get(k)
    if (!raw) return -1
    const value = JSON.parse(raw) as Record<string, number>
    const next = Number(value[field] || 0) + 1
    if (next >= max) this.values.delete(k)
    else this.values.set(k, JSON.stringify({ ...value, [field]: next }))
    return next
  }
}
const binding: ServiceBinding = {
  serviceId: 'backend-admin',
  secret: 'secret',
  prefix: 'yaxbgo',
  status: 'ACTIVE',
  scenes: {
    login: {
      allowedCaptchaTypes: ['SLIDER'],
      defaultCaptchaType: 'SLIDER',
      allowedModes: ['POPUP'],
      defaultMode: 'POPUP',
      ttl: 120,
      status: 'ACTIVE',
    },
  },
}
describe('CaptchaEngine', () => {
  afterEach(() => vi.restoreAllMocks())

  const mixedBinding: ServiceBinding = {
    ...binding,
    scenes: {
      login: {
        ...binding.scenes.login,
        allowedCaptchaTypes: ['SIMPLE_SLIDER', 'SLIDER', 'ROTATE'],
        defaultCaptchaType: 'SIMPLE_SLIDER',
        allowedModes: ['EMBED', 'POPUP'],
        rotation: { weights: { SIMPLE_SLIDER: 100, SLIDER: 1, ROTATE: 1 } },
      },
    },
  }

  it('filters popup selection on every load before applying weights', async () => {
    const engine = new CaptchaEngine(new MemoryRedis() as never)
    for (const random of [0, 0.5, 0.999]) {
      vi.spyOn(Math, 'random').mockReturnValue(random)
      const result = await engine.createChallenge(mixedBinding, {
        attemptId: `popup-${random}`,
        sceneId: 'login',
        mode: 'POPUP',
      })
      expect(['SLIDER', 'ROTATE']).toContain(result.CaptchaType)
      expect(result.Mode).toBe('POPUP')
    }
  })

  it('selects only SIMPLE_SLIDER in embed mode regardless of weights', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999)
    const result = await new CaptchaEngine(new MemoryRedis() as never).createChallenge(mixedBinding, {
      attemptId: 'embed',
      sceneId: 'login',
      mode: 'EMBED',
    })
    expect(result.CaptchaType).toBe('SIMPLE_SLIDER')
    expect(result.Mode).toBe('EMBED')
  })

  it.each([
    { mode: 'POPUP' as const, captchaType: 'SIMPLE_SLIDER' as const },
    { mode: 'EMBED' as const, captchaType: 'ROTATE' as const },
  ])('rejects explicit incompatible types: $mode / $captchaType', async (input) => {
    await expect(
      new CaptchaEngine(new MemoryRedis() as never).createChallenge(mixedBinding, {
        attemptId: 'invalid',
        sceneId: 'login',
        ...input,
      })
    ).rejects.toThrow('验证码类型不被该场景或展示模式允许')
  })

  it('uses a mode-compatible fallback when all allowed weights are zero', async () => {
    const configured = {
      ...mixedBinding,
      scenes: { login: { ...mixedBinding.scenes.login, rotation: { weights: { SIMPLE_SLIDER: 100 } } } },
    }
    const result = await new CaptchaEngine(new MemoryRedis() as never).createChallenge(configured, {
      attemptId: 'fallback',
      sceneId: 'login',
      mode: 'POPUP',
    })
    expect(result.CaptchaType).toBe('SLIDER')
  })

  it('rejects scenes with no types available for the requested mode', async () => {
    const configured = {
      ...mixedBinding,
      scenes: { login: { ...mixedBinding.scenes.login, allowedCaptchaTypes: ['SIMPLE_SLIDER' as const] } },
    }
    await expect(
      new CaptchaEngine(new MemoryRedis() as never).createChallenge(configured, {
        attemptId: 'empty',
        sceneId: 'login',
        mode: 'POPUP',
      })
    ).rejects.toThrow('该展示模式没有可用验证码类型')
  })

  const fixture = async (type: CaptchaType) => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const configured: ServiceBinding = {
      ...binding,
      scenes: {
        login: {
          ...binding.scenes.login,
          allowedCaptchaTypes: [type],
          defaultCaptchaType: type,
          allowedModes: [type === 'SIMPLE_SLIDER' ? 'EMBED' : 'POPUP'],
          defaultMode: type === 'SIMPLE_SLIDER' ? 'EMBED' : 'POPUP',
        },
      },
    }
    const input = { attemptId: 'flow', sceneId: 'login', subject: 'admin', clientIp: '127.0.0.1', userAgent: 'test' }
    const challenge = await engine.createChallenge(configured, input)
    const stored = JSON.parse([...redis.values.values()].find((value) => value.startsWith('{'))!)
    return { redis, engine, configured, input, challenge, stored }
  }

  it.each(['SIMPLE_SLIDER', 'SLIDER', 'ROTATE', 'GRID_IMAGE_SELECT', 'CLICK_ORDER'] as CaptchaType[])(
    'verifies %s and rejects replay',
    async (type) => {
      const { engine, configured, input, challenge, stored } = await fixture(type)
      if (type !== 'SIMPLE_SLIDER') expect(challenge.Payload).toMatchObject({ canvasWidth: 300, canvasHeight: 180 })
      let answer
      if (type === 'SIMPLE_SLIDER' || type === 'SLIDER') {
        const start = type === 'SIMPLE_SLIDER' ? stored.trackWidth - stored.buttonWidth : 0
        answer = {
          finalX: stored.targetX,
          trackWidth: stored.trackWidth,
          points: Array.from({ length: 11 }, (_, i) => ({
            x: Math.round(start + ((stored.targetX - start) * i) / 10),
            y: 20,
            t: i * 100,
          })),
        }
      } else if (type === 'ROTATE') answer = { finalAngle: stored.targetAngle }
      else
        answer = {
          selectedIndexes: type === 'GRID_IMAGE_SELECT' ? stored.answerSet.slice().reverse() : stored.answerSet,
        }
      const request = { ...input, challengeId: challenge.ChallengeId, answer }
      expect((await engine.verifyChallenge(configured, request)).CaptchaToken).toBeTruthy()
      await expect(engine.verifyChallenge(configured, request)).rejects.toMatchObject({ code: 'CHALLENGE_NOT_FOUND' })
    }
  )

  it('bakes rotation into image pixels without returning the answer', async () => {
    const redis = new MemoryRedis(),
      engine = new CaptchaEngine(redis as never)
    vi.spyOn(engine as any, 'randomInt').mockReturnValue(90)
    const configured: ServiceBinding = {
      ...binding,
      scenes: { login: { ...binding.scenes.login, allowedCaptchaTypes: ['ROTATE'], defaultCaptchaType: 'ROTATE' } },
    }
    const result = await engine.createChallenge(configured, { attemptId: 'rotate', sceneId: 'login' })
    const bytes = Buffer.from(result.Payload.image!.split(',')[1], 'base64')
    expect((await sharp(bytes).metadata()).format).toBe('png')
    expect(result.Payload).not.toHaveProperty('targetAngle')
    const catalog = new ResourceCatalog()
    const expected = await Promise.all(
      Array.from({ length: catalog.groupCount('ROTATE') }, async (_, group) => {
        const source = catalog.image('ROTATE', group)!
        const upright = await sharp(Buffer.from(source.split(',')[1], 'base64'))
          .resize(170, 170, { fit: 'cover' })
          .png()
          .toBuffer()
        const rotated = await sharp(upright).rotate(270, { background: '#ffffff' }).png().toBuffer()
        return sharp(rotated).resize(170, 170, { fit: 'cover' }).png().toBuffer()
      })
    )
    expect(expected.some((image) => image.equals(bytes))).toBe(true)
  })

  it('atomically replaces a challenge and refuses stale refreshes', async () => {
    const { engine, configured, input, challenge, stored } = await fixture('ROTATE')
    const next = await engine.createChallenge(configured, { ...input, previousChallengeId: challenge.ChallengeId })
    await expect(
      engine.verifyChallenge(configured, {
        ...input,
        challengeId: challenge.ChallengeId,
        answer: { finalAngle: stored.targetAngle },
      })
    ).rejects.toMatchObject({ code: 'CHALLENGE_NOT_FOUND' })
    await expect(
      engine.createChallenge(configured, { ...input, previousChallengeId: challenge.ChallengeId })
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' })
    expect(next.ChallengeId).not.toBe(challenge.ChallengeId)
  })

  it('allows exactly one winner for concurrent valid verification', async () => {
    const { engine, configured, input, challenge, stored } = await fixture('ROTATE')
    const request = { ...input, challengeId: challenge.ChallengeId, answer: { finalAngle: stored.targetAngle } }
    const results = await Promise.allSettled([
      engine.verifyChallenge(configured, request),
      engine.verifyChallenge(configured, request),
    ])
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  })

  it.each(['GRID_IMAGE_SELECT', 'CLICK_ORDER'] as CaptchaType[])(
    'rejects duplicate, out-of-range and unordered answers for %s',
    async (type) => {
      for (const invalid of ['duplicate', 'range', 'wrong']) {
        const { engine, configured, input, challenge, stored } = await fixture(type)
        const selected =
          invalid === 'duplicate'
            ? [...stored.answerSet, stored.answerSet[0]]
            : invalid === 'range'
            ? [99, 98, 97]
            : type === 'CLICK_ORDER'
            ? stored.answerSet.slice().reverse()
            : [0, 1, 2].map((i) => (stored.answerSet[i] + 1) % 9)
        // A cyclic shift of a set can occasionally equal the original; force a wrong count instead.
        if (type === 'GRID_IMAGE_SELECT' && invalid === 'wrong') selected.pop()
        await expect(
          engine.verifyChallenge(configured, {
            ...input,
            challengeId: challenge.ChallengeId,
            answer: { selectedIndexes: selected },
          })
        ).rejects.toMatchObject({ code: 'ANSWER_INVALID' })
      }
    }
  )

  it('rejects expired challenges even if stale Redis data remains', async () => {
    const { engine, configured, input, challenge, stored } = await fixture('ROTATE')
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 121000)
    await expect(
      engine.verifyChallenge(configured, {
        ...input,
        challengeId: challenge.ChallengeId,
        answer: { finalAngle: stored.targetAngle },
      })
    ).rejects.toMatchObject({ code: 'CHALLENGE_EXPIRED' })
  })

  it('generates resources and consumes a successful token once', async () => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const c = await engine.createChallenge(binding, {
      attemptId: 'attempt-1',
      sceneId: 'login',
      subject: 'admin',
      clientIp: '127.0.0.1',
      userAgent: 'Chrome',
    })
    expect(c.Payload.backgroundImage).toMatch(/^data:image\/svg\+xml;base64,/)
    const stored = JSON.parse([...redis.values.values()].find((value) => value.startsWith('{'))!) as {
      targetX: number
    }
    const points = Array.from({ length: 11 }, (_, i) => ({
      x: Math.round((stored.targetX * i) / 10),
      y: 20,
      t: i * 100,
    }))
    const result = await engine.verifyChallenge(binding, {
      attemptId: 'attempt-1',
      challengeId: c.ChallengeId,
      sceneId: 'login',
      subject: 'admin',
      clientIp: '127.0.0.1',
      userAgent: 'Chrome',
      points,
      finalX: stored.targetX,
      trackWidth: c.Payload.trackWidth,
    })
    expect(
      await engine.consumeToken(binding, {
        attemptId: 'attempt-1',
        token: result.CaptchaToken,
        sceneId: 'login',
        subject: 'admin',
        clientIp: '127.0.0.1',
      })
    ).toBe(true)
    expect(
      await engine.consumeToken(binding, {
        attemptId: 'attempt-1',
        token: result.CaptchaToken,
        sceneId: 'login',
        subject: 'admin',
        clientIp: '127.0.0.1',
      })
    ).toBe(false)
  })

  it('keeps a challenge for limited answer retries', async () => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const c = await engine.createChallenge(binding, {
      attemptId: 'attempt-retry',
      sceneId: 'login',
      subject: 'admin',
      clientIp: '127.0.0.2',
      userAgent: 'Chrome',
    })
    const stored = JSON.parse([...redis.values.values()].find((value) => value.startsWith('{'))!) as {
      targetX: number
    }
    const invalidInput = {
      attemptId: 'attempt-retry',
      challengeId: c.ChallengeId,
      sceneId: 'login' as const,
      subject: 'admin',
      clientIp: '127.0.0.2',
      userAgent: 'Chrome',
      points: Array.from({ length: 11 }, (_, i) => ({ x: i, y: 20, t: i * 100 })),
      finalX: stored.targetX + 100,
      trackWidth: c.Payload.trackWidth,
    }
    await expect(engine.verifyChallenge(binding, invalidInput)).rejects.toMatchObject({
      code: 'ANSWER_INVALID',
    })
    expect([...redis.values.values()].some((value) => value.includes('verifyAttempts'))).toBe(true)
  })

  it('uses the checked-in real gallery for grid challenges', async () => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const gridBinding: ServiceBinding = {
      ...binding,
      scenes: {
        grid: {
          allowedCaptchaTypes: ['GRID_IMAGE_SELECT'],
          defaultCaptchaType: 'GRID_IMAGE_SELECT',
          allowedModes: ['POPUP'],
          defaultMode: 'POPUP',
          ttl: 120,
          status: 'ACTIVE',
        },
      },
    }
    const challenge = await engine.createChallenge(gridBinding, {
      attemptId: 'attempt-grid',
      sceneId: 'grid',
      subject: 'admin',
      clientIp: '127.0.0.3',
      userAgent: 'Chrome',
    })
    expect(challenge.Payload.targetImage).toMatch(/^data:image\/(svg\+xml|jpeg);base64,/)
    const tiles = challenge.Payload.tiles || []
    expect(tiles).toHaveLength(9)
    expect(tiles[0]?.image).toMatch(/^data:image\/jpeg;base64,/)
  })

  it('centers click-order artwork in equal visual boxes and aligns background targets', async () => {
    const { engine, challenge } = await fixture('CLICK_ORDER')
    const extents: number[] = []
    for (let index = 0; index < 6; index++) {
      const icon = await (engine as any).clickOrderIcon(index)
      const { data, info } = await sharp(Buffer.from(icon))
        .resize(96, 96)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const pixels: Array<[number, number]> = []
      for (let y = 0; y < 96; y++)
        for (let x = 0; x < 96; x++) {
          if (data[(y * 96 + x) * info.channels + info.channels - 1] > 64) pixels.push([x, y])
        }
      const xs = pixels.map(([x]) => x),
        ys = pixels.map(([, y]) => y)
      const left = Math.min(...xs),
        right = Math.max(...xs),
        top = Math.min(...ys),
        bottom = Math.max(...ys)
      expect(Math.abs((left + right) / 2 - 47.5)).toBeLessThanOrEqual(1)
      expect(Math.abs((top + bottom) / 2 - 47.5)).toBeLessThanOrEqual(1)
      extents.push(Math.max(right - left + 1, bottom - top + 1))
    }
    expect(Math.max(...extents) - Math.min(...extents)).toBeLessThanOrEqual(2)
    const background = Buffer.from(challenge.Payload.backgroundImage!.split(',')[1], 'base64')
    const metadata = await sharp(background).metadata()
    expect([metadata.width, metadata.height]).toEqual([300, 180])
    const images = [...background.toString().matchAll(/<image x="([^"]+)" y="([^"]+)" width="32" height="32"/g)]
    expect(images).toHaveLength(6)
    challenge.Payload.targets!.forEach((target, index) => {
      expect(Number(images[index][1]) + 16).toBeCloseTo((target.x + target.width / 2) * 3)
      expect(Number(images[index][2]) + 16).toBeCloseTo((target.y + target.height / 2) * 1.8)
    })
  })

  it('generates and verifies an ordered click challenge', async () => {
    const redis = new MemoryRedis()
    const engine = new CaptchaEngine(redis as never)
    const clickBinding: ServiceBinding = {
      ...binding,
      scenes: {
        click: {
          allowedCaptchaTypes: ['CLICK_ORDER'],
          defaultCaptchaType: 'CLICK_ORDER',
          allowedModes: ['POPUP'],
          defaultMode: 'POPUP',
          ttl: 120,
          status: 'ACTIVE',
        },
      },
    }
    const challenge = await engine.createChallenge(clickBinding, {
      attemptId: 'attempt-click-order',
      sceneId: 'click',
      subject: 'admin',
      clientIp: '127.0.0.4',
      userAgent: 'Chrome',
    })
    expect(challenge.Payload.backgroundImage).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(challenge.Payload.sequenceTargets).toHaveLength(3)
    expect(challenge.Payload.targets).toHaveLength(6)
    const stored = [...redis.values.values()]
      .filter((value) => value.startsWith('{'))
      .map((value) => JSON.parse(value) as { answerSet?: number[] })
      .find((value) => Array.isArray(value.answerSet))
    expect(stored?.answerSet).toHaveLength(3)
    const result = await engine.verifyChallenge(clickBinding, {
      attemptId: 'attempt-click-order',
      challengeId: challenge.ChallengeId,
      sceneId: 'click',
      subject: 'admin',
      clientIp: '127.0.0.4',
      userAgent: 'Chrome',
      answer: { selectedIndexes: stored?.answerSet },
    })
    expect(result.CaptchaToken).toBeTruthy()
  })
})
