import { SetMetadata } from '@nestjs/common'

export const IDEMPOTENCY_OPTIONS = 'idempotency_options'

export type IdempotencyOptions = {
  scope?: string
  ttlSeconds?: number
}

export const Idempotent = (options: IdempotencyOptions = {}) => SetMetadata(IDEMPOTENCY_OPTIONS, options)
