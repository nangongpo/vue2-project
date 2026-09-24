import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { PrismaService } from '../../database/prisma.service.js'
import { RedisService } from '../../cache/services/redis.service.js'
import { PasswordService } from './password.service.js'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
const PERIOD = 30
const ENROLLMENT_TTL = 600

export function encodeBase32(bytes: Buffer): string {
  let bits = 0,
    value = 0,
    result = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      result += ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits) result += ALPHABET[(value << (5 - bits)) & 31]
  return result
}

/** RFC 4226 dynamic truncation, used by RFC 6238 with a 30-second counter. */
export function totpAtStep(secret: Buffer, step: bigint, digits = 6): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(step)
  const hash = createHmac('sha1', secret).update(counter).digest()
  const offset = hash[hash.length - 1] & 15
  return ((hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).toString().padStart(digits, '0')
}

@Injectable()
export class MfaService {
  constructor(private readonly prisma: PrismaService, private readonly passwords: PasswordService, private readonly redis: RedisService) {}

  private key(): Buffer {
    const encoded = process.env.MFA_ENCRYPTION_KEY || ''
    const key = Buffer.from(encoded, 'base64')
    if (key.length !== 32 || key.toString('base64') !== encoded) {
      throw new ServiceUnavailableException('多因素认证配置不可用')
    }
    return key
  }

  private encrypt(secret: Buffer, userId: bigint): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv)
    cipher.setAAD(Buffer.from(`mfa:v1:${userId}`))
    const encrypted = Buffer.concat([cipher.update(secret), cipher.final()])
    return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), encrypted.toString('base64')].join('.')
  }

  private decrypt(encoded: string, userId: bigint): Buffer {
    const key = this.key()
    try {
      const [version, iv, tag, value, extra] = encoded.split('.')
      if (version !== 'v1' || !iv || !tag || !value || extra !== undefined) throw new Error()
      const nonce = Buffer.from(iv, 'base64'),
        authTag = Buffer.from(tag, 'base64')
      if (nonce.length !== 12 || authTag.length !== 16) throw new Error()
      const cipher = createDecipheriv('aes-256-gcm', key, nonce)
      cipher.setAAD(Buffer.from(`mfa:v1:${userId}`))
      cipher.setAuthTag(authTag)
      const secret = Buffer.concat([cipher.update(Buffer.from(value, 'base64')), cipher.final()])
      if (secret.length !== 20) throw new Error()
      return secret
    } catch {
      throw new ServiceUnavailableException('多因素认证配置不可用')
    }
  }

  private async rateLimit(userId: bigint, scope: string) {
    const count = await this.redis.increment(`security:mfa:${scope}:${userId}`, 60)
    if (count === null) throw new ServiceUnavailableException('认证限频服务不可用，请稍后重试')
    if (count > 5) throw new HttpException('认证请求过于频繁，请稍后重试', HttpStatus.TOO_MANY_REQUESTS)
  }

  private async activeUser(userId: bigint) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    const now = new Date()
    if (!user || user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= now) || (user.lockedUntil && user.lockedUntil > now)) {
      throw new UnauthorizedException('账号不可用')
    }
    return user
  }

  private matchStep(secret: Buffer, otp: string, lastStep: bigint | null): bigint {
    if (!/^\d{6}$/.test(otp)) throw new ForbiddenException('动态验证码无效或已使用')
    const current = BigInt(Math.floor(Date.now() / 1000 / PERIOD))
    for (const offset of [0n, -1n, 1n]) {
      const step = current + offset
      if (step < 0n || (lastStep !== null && step <= lastStep)) continue
      if (timingSafeEqual(Buffer.from(totpAtStep(secret, step)), Buffer.from(otp))) return step
    }
    throw new ForbiddenException('动态验证码无效或已使用')
  }

  private sessionWhere(userId: bigint, rawToken?: string) {
    if (!rawToken) throw new UnauthorizedException('登录状态不存在')
    const now = new Date()
    const idleTtl = Number(process.env.SESSION_IDLE_TTL_SECONDS || process.env.SESSION_TTL_SECONDS || 1800)
    return {
      id: createHash('sha256').update(rawToken).digest('hex'),
      userId,
      revokedAt: null,
      expiresAt: { gt: now },
      lastSeenAt: { gt: new Date(now.getTime() - idleTtl * 1000) },
    }
  }

  private pendingKey(userId: bigint, rawToken?: string) {
    return `security:mfa:enrollment:${userId}:${this.sessionWhere(userId, rawToken).id}`
  }

  async enroll(userId: bigint, password: string, rawToken?: string) {
    await this.rateLimit(userId, 'password')
    const user = await this.activeUser(userId)
    if (!(await this.passwords.verify(password, user.passwordHash))) throw new ForbiddenException('密码验证失败')
    if (user.mfaEnabled) throw new BadRequestException('多因素认证已启用')
    if (!(await this.prisma.session.findFirst({ where: this.sessionWhere(userId, rawToken) })))
      throw new UnauthorizedException('登录状态已失效')
    const secretBytes = randomBytes(20)
    const encrypted = this.encrypt(secretBytes, userId)
    if (!(await this.redis.set(this.pendingKey(userId, rawToken), encrypted, ENROLLMENT_TTL))) {
      throw new ServiceUnavailableException('多因素认证暂不可用')
    }
    const secret = encodeBase32(secretBytes)
    const issuer = 'vue2-project'
    const uri = `otpauth://totp/${encodeURIComponent(`${issuer}:${user.username}`)}?secret=${secret}&issuer=${encodeURIComponent(
      issuer
    )}&algorithm=SHA1&digits=6&period=${PERIOD}`
    return { secret, uri, expiresIn: ENROLLMENT_TTL }
  }

  async confirm(userId: bigint, otp: string, rawToken?: string) {
    await this.rateLimit(userId, 'otp')
    const user = await this.activeUser(userId)
    if (user.mfaEnabled) throw new BadRequestException('多因素认证已启用')
    const pendingKey = this.pendingKey(userId, rawToken)
    const encrypted = await this.redis.get(pendingKey)
    if (!encrypted) throw new BadRequestException('绑定已过期，请重新验证密码')
    const step = this.matchStep(this.decrypt(encrypted, userId), otp, null)
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: userId,
          mfaEnabled: false,
          status: 'ACTIVE',
          passwordHash: user.passwordHash,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { mfaSecret: encrypted, mfaEnabled: true, mfaLastStep: step },
      })
      if (changed.count !== 1) throw new ForbiddenException('绑定状态已变化，请重新登录')
      const session = await tx.session.updateMany({
        where: this.sessionWhere(userId, rawToken),
        data: { mfaVerifiedAt: now, reauthenticatedAt: now },
      })
      if (session.count !== 1) throw new UnauthorizedException('登录状态已失效')
    })
    // Expiring the encrypted pending value is sufficient; never return it again.
    await this.redis.set(pendingKey, '', 1)
    return { mfaEnabled: true, mfaVerifiedAt: now, reauthenticatedAt: now }
  }

  /** Consumes one code atomically across login/reauth requests and application instances. */
  async verify(userId: bigint, otp: string): Promise<void> {
    await this.rateLimit(userId, 'otp')
    const user = await this.activeUser(userId)
    if (!user.mfaEnabled || !user.mfaSecret) throw new ForbiddenException('请先绑定多因素认证')
    const step = this.matchStep(this.decrypt(user.mfaSecret, userId), otp, user.mfaLastStep)
    const changed = await this.prisma.user.updateMany({
      where: {
        id: userId,
        status: 'ACTIVE',
        mfaEnabled: true,
        mfaSecret: user.mfaSecret,
        mfaLastStep: user.mfaLastStep,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      data: { mfaLastStep: step },
    })
    if (changed.count !== 1) throw new ForbiddenException('动态验证码无效或已使用')
  }

  async reauthenticate(userId: bigint, password: string, otp: string | undefined, rawToken?: string) {
    await this.rateLimit(userId, 'password')
    const user = await this.activeUser(userId)
    if (!(await this.passwords.verify(password, user.passwordHash))) throw new ForbiddenException('密码验证失败')
    if (user.mfaEnabled) await this.verify(userId, otp || '')
    const now = new Date()
    await this.prisma.$transaction(async (tx) => {
      // Lock/check the exact account state proved above before updating the session.
      const account = await tx.user.updateMany({
        where: {
          id: userId,
          status: 'ACTIVE',
          passwordHash: user.passwordHash,
          mfaEnabled: user.mfaEnabled,
          mfaSecret: user.mfaSecret,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        data: { updatedAt: now },
      })
      if (account.count !== 1) throw new ForbiddenException('账号状态已变化，请重新登录')
      const result = await tx.session.updateMany({
        where: this.sessionWhere(userId, rawToken),
        data: { reauthenticatedAt: now, ...(user.mfaEnabled ? { mfaVerifiedAt: now } : {}) },
      })
      if (result.count !== 1) throw new UnauthorizedException('登录状态已失效')
    })
    return { reauthenticatedAt: now, ...(user.mfaEnabled ? { mfaVerifiedAt: now } : {}) }
  }
}
