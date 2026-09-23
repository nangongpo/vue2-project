import { describe, expect, it, vi } from 'vitest'
import { of } from 'rxjs'
import { TraceIdInterceptor } from './trace-id.interceptor.js'

describe('TraceIdInterceptor', () => {
  it('always creates a server-owned trace id', () => {
    const request: { headers: Record<string, string>; traceId?: string } = { headers: { 'x-request-trace-id': 'client-controlled-id' } }
    const response = { header: vi.fn() }
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any

    new TraceIdInterceptor().intercept(context, { handle: () => of('ok') }).subscribe()

    expect(request.traceId).toMatch(/^[0-9a-f-]{36}$/)
    expect(request.traceId).not.toBe('client-controlled-id')
    expect(response.header).toHaveBeenCalledWith('X-Request-Trace-Id', request.traceId)
  })
})
