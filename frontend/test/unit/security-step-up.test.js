import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import axios from 'axios'

vi.mock('../../src/api/http/session-expired', () => ({
  handleUnauthorized: vi.fn(), isAuthRequest: () => false, isUnauthorizedCode: () => false,
}))
vi.mock('../../src/api', () => ({ axiosPost: vi.fn() }))
vi.mock('../../src/api/http', async () => {
  const { setSecurityStepUpHandler } = await import('../../src/api/http/error-handler')
  return { setSecurityStepUpHandler }
})

import App from '../../src/App.vue'
import { setSecurityStepUpHandler, setupErrorHandler } from '../../src/api/http/error-handler'

const problem = {
  code: '100013', message: '需要完成高风险操作验证',
  data: { riskLevel: 'L2', operationCode: 'test.write', requiredFactors: ['PASSWORD', 'OTP'] },
}
let wrapper

afterEach(() => { wrapper?.destroy(); wrapper = null; setSecurityStepUpHandler(null) })

function client(status = 403) {
  const adapter = vi.fn(async (config) => {
    const response = { status, data: problem, config, headers: {} }
    if (status >= 400) throw new axios.AxiosError('Forbidden', '', config, null, response)
    return response
  })
  const request = axios.create({ adapter })
  setupErrorHandler(request)
  return { request, adapter }
}

describe('global security step-up', () => {
  it.each([200, 403])('opens the global dialog for a child request (HTTP %s)', async (status) => {
    const { request, adapter } = client(status)
    let pending
    const Child = { render: (h) => h('div'), mounted() { pending = request.post('/any/write', {}).catch((e) => e) } }
    wrapper = mount(App, {
      mocks: { $store: { state: { user: { user_info: {}, authenticated: false } } } },
      stubs: { 'router-view': Child, 'reauth-dialog': true },
    })
    await vi.waitFor(() => expect(wrapper.vm.securityStepUpVisible).toBe(true))
    expect(wrapper.vm.securityStepUpMfaEnabled).toBe(true)
    wrapper.vm.cancelSecurityStepUp()
    expect(await pending).toMatchObject({ code: '100013' })
    expect(adapter).toHaveBeenCalledTimes(1)
  })

  it('retries only after verification and keeps the original request and idempotency key', async () => {
    const { request, adapter } = client()
    adapter.mockImplementationOnce(async (config) => {
      throw new axios.AxiosError('Forbidden', '', config, null, { status: 403, data: problem, config })
    }).mockResolvedValueOnce({ status: 200, data: { code: '000000', data: { ok: true } } })
    const handler = vi.fn(async () => true)
    setSecurityStepUpHandler(handler)
    expect(await request.post('/any/write', { reason: 'test' }, { headers: { 'Idempotency-Key': 'same-key' } })).toMatchObject({ ok: true })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining(problem.data))
    expect(adapter.mock.calls[1][0]).toMatchObject({ url: '/any/write', __stepUpRetried: true, data: '{"reason":"test"}' })
    expect(adapter.mock.calls[1][0].headers.get('Idempotency-Key')).toBe('same-key')
  })
  it('reports the error when no global dialog handler is registered', async () => {
    const { request } = client()
    await expect(request.post('/any/write')).rejects.toMatchObject({ code: '100013', silent: false })
  })

  it('does not loop when the retried request still requires verification', async () => {
    const { request, adapter } = client()
    const handler = vi.fn(async () => true)
    setSecurityStepUpHandler(handler)
    await expect(request.post('/any/write')).rejects.toMatchObject({ code: '100013', silent: false })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(adapter).toHaveBeenCalledTimes(2)
  })

})
