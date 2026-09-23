import { Injectable } from '@nestjs/common'
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
function derive(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number }) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error)
      else resolve(derived as Buffer)
    })
  })
}

@Injectable()
export class PasswordService {
  async hash(password: string) {
    const salt = randomBytes(16)
    const derived = await derive(password, salt, 64, { N: 16384, r: 8, p: 1 })
    return `scrypt$16384$8$1$${salt.toString('base64url')}$${derived.toString('base64url')}`
  }

  async verify(password: string, encoded: string) {
    const [algorithm, n, r, p, saltValue, hashValue] = encoded.split('$')
    if (algorithm !== 'scrypt' || !n || !r || !p || !saltValue || !hashValue) return false
    const salt = Buffer.from(saltValue, 'base64url')
    const expected = Buffer.from(hashValue, 'base64url')
    const actual = await derive(password, salt, expected.length, { N: Number(n), r: Number(r), p: Number(p) })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}
