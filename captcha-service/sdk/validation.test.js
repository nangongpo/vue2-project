import { describe, expect, it } from 'vitest'
import { ResourceCatalog } from '../src/captcha/services/resource.catalog.ts'
import { normalizeChallenge } from './validation.js'

const challenge = {
  attemptId: 'attempt-123',
  challengeId: 'challenge-123',
  sceneId: 'login',
  captchaType: 'SIMPLE_SLIDER',
  mode: 'EMBED',
  typeVersion: '1.0.0',
  resourceVersion: 'dev-1',
  expiresIn: 120,
  payload: { trackWidth: 280, buttonWidth: 42 },
}

describe('captcha SDK Challenge normalization', () => {
  it('rejects SIMPLE_SLIDER in POPUP mode', () => {
    expect(() => normalizeChallenge({ ...challenge, mode: 'POPUP' })).toThrow('验证码类型不支持该展示模式')
  })

  it.each(['SLIDER', 'ROTATE', 'GRID_IMAGE_SELECT', 'CLICK_ORDER'])('rejects %s in EMBED mode', (captchaType) => {
    expect(() => normalizeChallenge({ ...challenge, captchaType })).toThrow('验证码类型不支持该展示模式')
  })

  it('rejects a valid challenge belonging to a different SDK mode', () => {
    expect(() => normalizeChallenge(challenge, 'POPUP')).toThrow('Challenge 展示模式与 SDK 不一致')
  })

  it.each([
    [300, 300],
    [640, 360],
    [undefined, undefined],
  ])('rejects a mismatched popup canvas %s × %s', (canvasWidth, canvasHeight) => {
    expect(() =>
      normalizeChallenge({ ...challenge, mode: 'POPUP', captchaType: 'ROTATE', payload: { canvasWidth, canvasHeight } })
    ).toThrow('弹窗验证码画布必须为 300 × 180 px')
  })

  it('accepts the catalog Base64 image for a rotate challenge', () => {
    const image = new ResourceCatalog().image('ROTATE', 0)
    expect(image.length).toBeGreaterThan(4096)
    expect(
      normalizeChallenge({
        ...challenge,
        captchaType: 'ROTATE',
        mode: 'POPUP',
        payload: {
          canvasWidth: 300,
          canvasHeight: 180,
          image,
          minAngle: 0,
          maxAngle: 359,
          initialAngle: 0,
          rotationStep: 1,
        },
      }).payload.image
    ).toBe(image)
  })

  it('accepts a Base64 image at the published 2 MiB file limit', () => {
    const image = `data:image/jpeg;base64,${'A'.repeat(4 * Math.ceil((2 * 1024 * 1024) / 3))}`
    expect(() =>
      normalizeChallenge({
        ...challenge,
        captchaType: 'ROTATE',
        mode: 'POPUP',
        payload: {
          canvasWidth: 300,
          canvasHeight: 180,
          image,
          minAngle: 0,
          maxAngle: 359,
          initialAngle: 0,
          rotationStep: 1,
        },
      })
    ).not.toThrow()
  })

  it.each([undefined, null, '', 123, 'A'.repeat(3 * 1024 * 1024)])(
    'rejects an invalid or oversized rotate image (%#)',
    (image) => {
      expect(() =>
        normalizeChallenge({
          ...challenge,
          captchaType: 'ROTATE',
          mode: 'POPUP',
          payload: {
            canvasWidth: 300,
            canvasHeight: 180,
            image,
            minAngle: 0,
            maxAngle: 359,
            initialAngle: 0,
            rotationStep: 1,
          },
        })
      ).toThrow('rotate.image 必须是有效字符串')
    }
  )

  it('preserves attemptId for the backend verify request', () => {
    expect(normalizeChallenge(challenge).attemptId).toBe('attempt-123')
  })

  it('accepts the backend PascalCase envelope', () => {
    expect(
      normalizeChallenge({
        AttemptId: 'attempt-456',
        ChallengeId: 'challenge-456',
        SceneId: 'login',
        CaptchaType: 'SIMPLE_SLIDER',
        Mode: 'EMBED',
        TypeVersion: '1.0.0',
        ResourceVersion: 'dev-1',
        ExpiresIn: 120,
        Payload: { trackWidth: 280, buttonWidth: 42 },
      }).attemptId
    ).toBe('attempt-456')
  })

  it('requires a target line drawing for grid challenges', () => {
    expect(() =>
      normalizeChallenge({
        ...challenge,
        captchaType: 'GRID_IMAGE_SELECT',
        mode: 'POPUP',
        payload: {
          canvasWidth: 300,
          canvasHeight: 180,
          tiles: Array.from({ length: 9 }, (_, index) => ({ index, image: `tile-${index}` })),
          requiredCount: 3,
        },
      })
    ).toThrow('grid.targetImage 必须是有效字符串')
  })

  it('validates the click-order sequence and clickable targets', () => {
    const normalized = normalizeChallenge({
      ...challenge,
      captchaType: 'CLICK_ORDER',
      mode: 'POPUP',
      payload: {
        canvasWidth: 300,
        canvasHeight: 180,
        backgroundImage: 'background',
        sequenceTargets: [{ image: 'icon-1' }, { image: 'icon-2' }, { image: 'icon-3' }],
        targets: Array.from({ length: 6 }, (_, index) => ({
          index,
          x: index * 10,
          y: 20,
          width: 18,
          height: 24,
          image: `icon-${index}`,
        })),
      },
    })
    expect(normalized.payload.sequenceTargets).toHaveLength(3)
    expect(normalized.payload.targets).toHaveLength(6)
  })
})
