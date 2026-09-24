import { Injectable } from '@nestjs/common'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { assertPasswordStrength } from './password-policy.service.js'
const SCRYPT_COST = 131072
const SCRYPT_MAXMEM = 256 * 1024 * 1024

function derive(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, { ...options, maxmem: SCRYPT_MAXMEM }, (error, derived) => {
      if (error) reject(error)
      else resolve(derived as Buffer)
    })
  })
}

@Injectable()
export class PasswordService {
  async hash(password: string) {
    assertPasswordStrength(password)
    const salt = randomBytes(16)
    const derived = await derive(password, salt, 64, { N: SCRYPT_COST, r: 8, p: 1 })
    return `scrypt$${SCRYPT_COST}$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`
  }

  async verify(password: string, encoded: string) {
    if (typeof password !== 'string' || password.length > 256 || typeof encoded !== 'string' || encoded.length > 255) return false
    // Only accept the parameters and canonical lengths emitted by this service.
    // Costs are allowlisted for legacy compatibility; output length and memory are fixed.
    if (!/^scrypt\$(?:16384|131072)\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/.test(encoded)) return false
    const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$')
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) return false
    const salt = Buffer.from(saltValue, 'base64url')
    const expected = Buffer.from(hashValue, 'base64url')
    if (salt.toString('base64url') !== saltValue || expected.toString('base64url') !== hashValue) return false
    try {
      const actual = await derive(password, salt, 64, { N: Number(n), r: 8, p: 1 })
      return timingSafeEqual(actual, expected)
    } catch {
      return false
    }
  }
}
