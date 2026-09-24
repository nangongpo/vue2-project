import { describe, expect, it } from 'vitest'
import { of, lastValueFrom } from 'rxjs'
import { ApiResponseInterceptor } from '../interceptors/api-response.interceptor.js'

describe('ApiResponseInterceptor', () => {
  const context = (statusCode = 200) =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
      }),
    }) as any

  it('wraps an unwrapped successful value', async () => {
    const result = await lastValueFrom(new ApiResponseInterceptor().intercept(context(), { handle: () => of({ id: '1' }) }))
    expect(result).toEqual({ code: '000000', message: 'success', data: { id: '1' } })
  })

  it('does not double-wrap an existing API response', async () => {
    const payload = { code: '000000', message: 'success', data: null }
    const result = await lastValueFrom(new ApiResponseInterceptor().intercept(context(), { handle: () => of(payload) }))
    expect(result).toBe(payload)
  })

  it('keeps 204 responses bodyless', async () => {
    const result = await lastValueFrom(new ApiResponseInterceptor().intercept(context(204), { handle: () => of(undefined) }))
    expect(result).toBeUndefined()
  })
})
