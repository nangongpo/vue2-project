import { beforeEach, describe, expect, it, vi } from 'vitest'

const request = vi.fn()

vi.mock('../../src/api/http', () => ({
  default: request,
  notifyRequestError: vi.fn(),
}))

const { sendRequest } = await import('../../src/api/index.js')

describe('frontend idempotency route policy', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue({ data: { code: '000000' } })
  })

  it('adds a key to complete-idempotency writes', async () => {
    await sendRequest({ url: '/files/uploads/initiate', method: 'post', params: {}, config: { idempotencyKey: 'test-key' } })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      headers: { 'Idempotency-Key': 'test-key' },
    }))
  })

  it('does not add a generic key to queries or upload parts', async () => {
    await sendRequest({ url: '/files/uploads/mine', method: 'get', params: {} })
    await sendRequest({ url: '/files/uploads/id/parts/1', method: 'put', params: new Blob(['x']) })

    expect(request.mock.calls[0][0].headers).toBeUndefined()
    expect(request.mock.calls[1][0].headers).toBeUndefined()
  })

  it('uses short-lock policy for login', async () => {
    await sendRequest({ url: '/auth/login', method: 'post', params: {}, config: { idempotencyKey: 'login-key' } })

    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      headers: { 'Idempotency-Key': 'login-key' },
    }))
  })
})
