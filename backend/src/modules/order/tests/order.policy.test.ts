import { describe, expect, it } from 'vitest'
import { BadRequestException } from '@nestjs/common'
import { assertEditable, assertOrderTransition } from '#app/modules/order/domain/order.policy.js'

describe('order policy', () => {
  it('allows only the defined lifecycle transitions', () => {
    expect(() => assertOrderTransition('DRAFT', 'CONFIRMED')).not.toThrow()
    expect(() => assertOrderTransition('CONFIRMED', 'CANCELLED')).not.toThrow()
    expect(() => assertOrderTransition('COMPLETED', 'CANCELLED')).toThrow(BadRequestException)
  })

  it('allows edits only while an order is a draft', () => {
    expect(() => assertEditable('DRAFT')).not.toThrow()
    expect(() => assertEditable('CONFIRMED')).toThrow('仅草稿订单允许编辑')
  })
})
