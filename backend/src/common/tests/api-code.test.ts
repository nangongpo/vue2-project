import { describe, expect, it } from 'vitest'
import { API_CODE, API_MESSAGE, API_TITLE } from '../constants/api-code.js'
import { codeForStatus } from '../filters/api-exception.filter.js'
import { HttpStatus } from '@nestjs/common'

describe('API code contract', () => {
  it('contains a message for every public code', () => {
    for (const code of Object.values(API_CODE)) {
      expect(API_TITLE[code]).toBeTruthy()
      expect(API_MESSAGE[code]).toBeTruthy()
      if (code !== API_CODE.MFA_REQUIRED && code !== API_CODE.MFA_ENROLL_REQUIRED) {
        expect(API_TITLE[code]).not.toBe(API_MESSAGE[code])
      }
    }
  })

  it.each([
    [HttpStatus.BAD_REQUEST, API_CODE.INVALID_PARAMS],
    [HttpStatus.UNAUTHORIZED, API_CODE.UNAUTHORIZED],
    [HttpStatus.FORBIDDEN, API_CODE.FORBIDDEN],
    [HttpStatus.NOT_FOUND, API_CODE.NOT_FOUND],
    [HttpStatus.CONFLICT, API_CODE.CONFLICT],
    [HttpStatus.INTERNAL_SERVER_ERROR, API_CODE.INTERNAL_ERROR],
    [HttpStatus.SERVICE_UNAVAILABLE, API_CODE.SERVICE_UNAVAILABLE],
  ])('maps HTTP %s to business code %s', (status, code) => {
    expect(codeForStatus(status)).toBe(code)
  })
})
