import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes } from 'node:crypto'
import { PrismaService } from '../database/prisma.service.js'
import { PasswordService } from './password.service.js'
import { AuthenticatedUser } from './auth.types.js'
import { RedisService } from '../cache/redis.service.js'
import { CaptchaService } from '../captcha/captcha.service.js'
import { API_CODE } from '../common/api-code.js'

export const SESSION_COOKIE = 'app_session'

export function sessionCookieOptions(maxAge?: number) {
  return {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax' as const,
    path: '/',
    ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
    ...(maxAge === undefined ? {} : { maxAge }),
  }
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly redis: RedisService,
    private readonly captcha?: CaptchaService,
  ) {}

  async login(username: string, password: string, ip?: string, userAgent?: string, captchaToken?: string, attemptId?: string) {
    const loginUsername = username.trim()
    const rateKey = `security:login:ip:${ip || 'unknown'}`
    const rateLimit = Number(process.env.LOGIN_RATE_LIMIT || 10)
    const rateWindow = Number(process.env.LOGIN_RATE_WINDOW_SECONDS || 60)
    const requests = await this.redis.increment(rateKey, rateWindow)
    if (requests !== null && requests > rateLimit) {
      throw new HttpException('登录请求过于频繁，请 1 分钟后重试', HttpStatus.TOO_MANY_REQUESTS)
    }
    const captchaVerified = captchaToken
      ? this.captcha
        ? await this.captcha.consumeToken(captchaToken, attemptId, loginUsername, ip)
        : false
      : false
    const user = await this.prisma.user.findUnique({
      where: { username: loginUsername },
      include: { roles: { where: { role: { status: 'ACTIVE' } }, include: { role: { include: { permissions: { include: { permission: true } } } } } } },
    })
    const now = new Date()
    if (!user || user.status !== 'ACTIVE' || (user.lockedUntil && user.lockedUntil > now)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    if (user.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null } })
      user.failedLogins = 0
      user.lockedUntil = null
    }

    const captchaFailureLimit = Number(process.env.LOGIN_CAPTCHA_FAILURE_LIMIT || 3)
    if (user.failedLogins >= captchaFailureLimit) {
      if (!captchaVerified) {
        throw new HttpException({ code: API_CODE.CAPTCHA_REQUIRED, message: '请先完成滑块验证' }, HttpStatus.FORBIDDEN)
      }
    }

    const valid = await this.passwords.verify(password, user.passwordHash)
    if (!valid) {
      const failureLimit = Number(process.env.LOGIN_FAILURE_LIMIT || 5)
      const lockMinutes = Number(process.env.LOGIN_LOCK_MINUTES || 15)
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: { increment: 1 } },
        select: { failedLogins: true },
      })
      if (updated.failedLogins >= failureLimit) {
        await this.prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + lockMinutes * 60 * 1000) } })
      }
      if (updated.failedLogins >= captchaFailureLimit) {
        throw new HttpException({ code: API_CODE.CAPTCHA_REQUIRED, message: '请先完成滑块验证' }, HttpStatus.FORBIDDEN)
      }
      throw new UnauthorizedException('用户名或密码错误')
    }

    const rawToken = randomBytes(32).toString('base64url')
    const sessionId = this.hashToken(rawToken)
    const ttl = Number(process.env.SESSION_TTL_SECONDS || 1800)
    await this.prisma.$transaction([
      this.prisma.session.create({
        data: {
          id: sessionId,
          userId: user.id,
          expiresAt: new Date(Date.now() + ttl * 1000),
          ip,
          userAgent,
        },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lastLoginAt: new Date(), lastLoginIp: ip },
      }),
    ])
    return { token: rawToken, expiresIn: ttl, user: await this.toUser(user) }
  }

  async authenticate(rawToken?: string): Promise<AuthenticatedUser> {
    if (!rawToken) throw new UnauthorizedException('登录状态不存在')
    const session = await this.prisma.session.findUnique({
      where: { id: this.hashToken(rawToken) },
      include: { user: { include: { roles: { where: { role: { status: 'ACTIVE' } }, include: { role: { include: { permissions: { include: { permission: true } } } } } } } } },
    })
    const now = new Date()
    const idleTtl = Number(process.env.SESSION_IDLE_TTL_SECONDS || process.env.SESSION_TTL_SECONDS || 1800)
    const idleExpired = session && session.lastSeenAt <= new Date(now.getTime() - idleTtl * 1000)
    if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('登录状态已失效')
    }
    if (idleExpired) {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } })
      throw new UnauthorizedException('登录状态因闲置超时已失效')
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } })
    return this.toUser(session.user)
  }

  async logout(rawToken?: string) {
    if (!rawToken) return
    await this.prisma.session.updateMany({ where: { id: this.hashToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } })
  }

  async listSessions(userId: bigint, currentRawToken?: string) {
    const currentSessionId = currentRawToken ? this.hashToken(currentRawToken) : undefined
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: { id: true, createdAt: true, lastSeenAt: true, expiresAt: true, ip: true, userAgent: true },
    })
    return sessions.map(session => ({ ...session, current: session.id === currentSessionId }))
  }

  async revokeSession(userId: bigint, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (!result.count) throw new UnauthorizedException('会话不存在或已失效')
  }

  async changePassword(userId: bigint, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } })
    if (!user || !(await this.passwords.verify(currentPassword, user.passwordHash))) {
      throw new UnauthorizedException('原密码错误')
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await this.passwords.hash(newPassword), failedLogins: 0, lockedUntil: null } }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])
    return { expiresIn: 0 }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private async toUser(user: any): Promise<AuthenticatedUser> {
    const permissions: string[] = user.roles.flatMap((item: any) => item.role.permissions.map((entry: any) => String(entry.permission.code)))
    const isSuperAdmin = permissions.includes('*')
    const expandedPermissions = isSuperAdmin
      ? (await this.prisma.permission.findMany({ select: { code: true } })).map(item => item.code)
      : permissions
    return {
      internalId: user.id,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      failedLogins: user.failedLogins,
      lastLoginAt: user.lastLoginAt || null,
      lastLoginIp: user.lastLoginIp || null,
      roles: user.roles.map((item: any) => ({ roleId: item.role.roleId, code: item.role.code, name: item.role.name })),
      permissions: [...new Set<string>(expandedPermissions.filter(permission => permission !== '*'))],
      isSuperAdmin,
    }
  }
}
