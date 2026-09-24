import { ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../../database/prisma.service.js'
import { PasswordService } from './password.service.js'
import { AuthenticatedUser } from '../types/auth.types.js'
import { RedisService } from '../../cache/services/redis.service.js'
import { CaptchaService } from '../../captcha/services/captcha.service.js'
import { API_CODE } from '../../common/constants/api-code.js'
import { effectivePermissions } from './effective-permissions.js'
import { MfaService } from './mfa.service.js'
import { roleAllowsPermission } from '../policies/permission-catalog.js'
import { PasswordPolicyService } from './password-policy.service.js'

export const SESSION_COOKIE = 'app_session'
export const PREAUTH_COOKIE = 'app_pre_auth'

type AuthUserRecord = Prisma.UserGetPayload<{
  include: {
    roles: {
      include: {
        role: {
          include: {
            permissions: { include: { permission: true } }
          }
        }
      }
    }
  }
}>

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

export function preAuthCookieOptions(maxAge?: number) {
  return sessionCookieOptions(maxAge)
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly redis: RedisService,
    private readonly captcha?: CaptchaService,
    private readonly mfa?: MfaService
  ) {}

  async login(
    username: string,
    password: string,
    ip?: string,
    userAgent?: string,
    captchaToken?: string,
    attemptId?: string,
    otp?: string
  ) {
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
    const now = new Date()
    const user = await this.prisma.user.findUnique({
      where: { username: loginUsername },
      include: {
        roles: {
          where: {
            revokedAt: null,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            role: { status: 'ACTIVE' },
          },
          include: {
            role: {
              include: {
                permissions: {
                  where: {
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
                    permission: { status: 'ACTIVE' },
                  },
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    })
    if (!user || user.status !== 'ACTIVE' || (user.expiresAt && user.expiresAt <= now) || (user.lockedUntil && user.lockedUntil > now)) {
      throw new UnauthorizedException('用户名或密码错误')
    }

    if (user.lockedUntil && user.lockedUntil <= now) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLogins: 0, lockedUntil: null },
      })
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
        await this.prisma.user.update({
          where: { id: user.id },
          data: { lockedUntil: new Date(Date.now() + lockMinutes * 60 * 1000) },
        })
      }
      if (updated.failedLogins >= captchaFailureLimit) {
        throw new HttpException({ code: API_CODE.CAPTCHA_REQUIRED, message: '请先完成滑块验证' }, HttpStatus.FORBIDDEN)
      }
      throw new UnauthorizedException('用户名或密码错误')
    }

    const loginUser = await this.toUser(user)
    const enrollRequired = loginUser.mfaRequired && !user.mfaEnabled
    const otpRequired = user.mfaEnabled && !otp
    if (user.mfaEnabled) {
      if (!this.mfa) throw new UnauthorizedException('多因素认证服务不可用')
      if (!otpRequired) await this.mfa.verify(user.id, otp!)
    }
    const rawToken = randomBytes(32).toString('base64url')
    const sessionId = this.hashToken(rawToken)
    const sessionTtl = Number(process.env.SESSION_TTL_SECONDS || 1800)
    const configuredPreAuthTtl = Number(process.env.PREAUTH_TTL_SECONDS || 300)
    const preAuthTtl = Number.isSafeInteger(configuredPreAuthTtl) && configuredPreAuthTtl > 0 ? configuredPreAuthTtl : 300
    const requiresPreAuth = enrollRequired || otpRequired
    const ttl = requiresPreAuth ? preAuthTtl : sessionTtl
    const configuredCap = Number(process.env.SESSION_MAX_CONCURRENT || 3)
    const cap = Number.isSafeInteger(configuredCap) && configuredCap > 0 ? configuredCap : 3
    for (let attempt = 0; ; attempt++) {
      try {
        await this.prisma.$transaction(
          async (tx) => {
            const now = new Date()
            const fresh = await tx.user.findUnique({ where: { id: user.id } })
            if (
              !fresh ||
              fresh.status !== 'ACTIVE' ||
              (fresh.expiresAt && fresh.expiresAt <= now) ||
              (fresh.lockedUntil && fresh.lockedUntil > now) ||
              fresh.passwordHash !== user.passwordHash ||
              fresh.mfaEnabled !== user.mfaEnabled ||
              fresh.mfaSecret !== user.mfaSecret
            ) {
              throw new UnauthorizedException('账户状态已变更，请重新登录')
            }
            const idleTtl = Number(process.env.SESSION_IDLE_TTL_SECONDS || process.env.SESSION_TTL_SECONDS || 1800)
            const sessions = await tx.session.findMany({
              where: {
                userId: user.id,
                revokedAt: null,
                expiresAt: { gt: now },
                lastSeenAt: { gt: new Date(now.getTime() - idleTtl * 1000) },
              },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              select: { id: true },
            })
            const excess = sessions.slice(cap - 1)
            if (excess.length)
              await tx.session.updateMany({
                where: {
                  userId: user.id,
                  id: { in: excess.map((session) => session.id) },
                  revokedAt: null,
                },
                data: { revokedAt: now },
              })
            await tx.session.create({
              data: {
                id: sessionId,
                userId: user.id,
                expiresAt: new Date(now.getTime() + ttl * 1000),
                ip,
                userAgent,
                ...(user.mfaEnabled && otp ? { mfaVerifiedAt: now, reauthenticatedAt: now } : {}),
              },
            })
            await tx.user.update({
              where: { id: user.id },
              data: { failedLogins: 0, lastLoginAt: now, lastLoginIp: ip },
            })
          },
          { isolationLevel: 'Serializable' }
        )
        break
      } catch (error) {
        if ((error as { code?: string }).code !== 'P2034') throw error
        if (attempt >= 2) throw new ConflictException('并发登录冲突，请重试')
      }
    }
    return {
      token: rawToken,
      expiresIn: ttl,
      user: loginUser,
      nextStep: enrollRequired ? 'MFA_ENROLL_REQUIRED' : otpRequired ? 'MFA_REQUIRED' : null,
    }
  }

  async completeLogin(rawToken: string | undefined, otp: string) {
    if (!rawToken) throw new UnauthorizedException('临时登录状态不存在')
    const user = await this.authenticate(rawToken)
    if (user.mfaVerifiedAt) throw new UnauthorizedException('临时登录状态无效')
    if (!user.mfaEnabled) throw new UnauthorizedException('账号尚未绑定认证器')
    if (!this.mfa) throw new UnauthorizedException('多因素认证服务不可用')
    await this.mfa.verify(user.internalId, otp)
    const now = new Date()
    const expiresIn = Number(process.env.SESSION_TTL_SECONDS || 1800)
    const formalToken = randomBytes(32).toString('base64url')
    const current = await this.prisma.session.findFirst({
      where: {
        id: this.hashToken(rawToken),
        userId: user.internalId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    })
    if (!current) throw new UnauthorizedException('临时登录状态已失效')
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: {
          id: this.hashToken(rawToken),
          userId: user.internalId,
          revokedAt: null,
          expiresAt: { gt: now },
        },
        data: { revokedAt: now, lastSeenAt: now },
      })
      if (revoked.count !== 1) throw new UnauthorizedException('临时登录状态已失效')
      await tx.session.create({
        data: {
          id: this.hashToken(formalToken),
          userId: user.internalId,
          expiresAt: new Date(now.getTime() + expiresIn * 1000),
          ip: current.ip,
          userAgent: current.userAgent,
          mfaVerifiedAt: now,
          reauthenticatedAt: now,
        },
      })
    })
    return { token: formalToken, expiresIn, user: await this.authenticate(formalToken) }
  }

  async authenticate(rawToken?: string): Promise<AuthenticatedUser> {
    if (!rawToken) throw new UnauthorizedException('登录状态不存在')
    const session = await this.prisma.session.findUnique({
      where: { id: this.hashToken(rawToken) },
      include: {
        user: {
          include: {
            roles: {
              where: {
                revokedAt: null,
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                role: { status: 'ACTIVE' },
              },
              include: {
                role: {
                  include: {
                    permissions: {
                      where: {
                        revokedAt: null,
                        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                        permission: { status: 'ACTIVE' },
                      },
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })
    const now = new Date()
    const idleTtl = Number(process.env.SESSION_IDLE_TTL_SECONDS || process.env.SESSION_TTL_SECONDS || 1800)
    const idleExpired = session && session.lastSeenAt <= new Date(now.getTime() - idleTtl * 1000)
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt <= now ||
      session.user.status !== 'ACTIVE' ||
      (session.user.expiresAt && session.user.expiresAt <= now) ||
      (session.user.lockedUntil && session.user.lockedUntil > now)
    ) {
      throw new UnauthorizedException('登录状态已失效')
    }
    if (idleExpired) {
      await this.prisma.session.update({ where: { id: session.id }, data: { revokedAt: now } })
      throw new UnauthorizedException('登录状态因闲置超时已失效')
    }
    await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: now } })
    return {
      ...(await this.toUser(session.user)),
      mfaVerifiedAt: session.mfaVerifiedAt,
      reauthenticatedAt: session.reauthenticatedAt,
    }
  }

  async logout(rawToken?: string) {
    if (!rawToken) return
    await this.prisma.session.updateMany({
      where: { id: this.hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  }

  async listSessions(userId: bigint, currentRawToken?: string) {
    const currentSessionId = currentRawToken ? this.hashToken(currentRawToken) : undefined
    const sessions = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
      },
    })
    return sessions.map((session) => ({ ...session, current: session.id === currentSessionId }))
  }

  async revokeSession(userId: bigint, sessionId: string) {
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (!result.count) throw new UnauthorizedException('会话不存在或已失效')
  }

  async changePassword(
    userId: bigint,
    currentPassword: string,
    newPassword: string,
    auditContext: { traceId?: string; ip?: string; userAgent?: string; roleTypes?: string[] } = {}
  ) {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          const user = await tx.user.findUnique({
            where: { id: userId },
            select: {
              id: true,
              userId: true,
              passwordHash: true,
              passwordChangedAt: true,
              status: true,
              expiresAt: true,
              lockedUntil: true,
            },
          })
          const now = new Date()
          if (
            !user ||
            user.status !== 'ACTIVE' ||
            (user.expiresAt && user.expiresAt <= now) ||
            (user.lockedUntil && user.lockedUntil > now) ||
            !(await this.passwords.verify(currentPassword, user.passwordHash))
          ) {
            throw new UnauthorizedException('原密码错误或账户已失效')
          }
          await new PasswordPolicyService(this.passwords).replace(tx, user, newPassword)
          await tx.user.update({
            where: { id: userId },
            data: { failedLogins: 0, lockedUntil: null },
          })
          await tx.session.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: now },
          })
          await tx.auditLog.create({
            data: {
              traceId: auditContext.traceId || randomUUID(),
              actorId: userId,
              action: 'auth.password.change',
              resource: 'user',
              method: 'POST',
              path: '/api/v1/auth/password',
              result: 'SUCCESS',
              statusCode: 200,
              ip: auditContext.ip,
              userAgent: auditContext.userAgent,
              detail: {
                targetId: user.userId,
                passwordChanged: true,
                sessionsRevoked: true,
                roleTypes: auditContext.roleTypes || [],
              },
            },
          })
        },
        { isolationLevel: 'Serializable', timeout: 20_000 }
      )
    } catch (error) {
      if ((error as { code?: string }).code === 'P2034') throw new ConflictException('密码修改冲突，请重试')
      throw error
    }
    return { expiresIn: 0 }
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  private async toUser(user: AuthUserRecord): Promise<AuthenticatedUser> {
    const now = new Date()
    const roles = user.roles.filter(
      (binding) => !binding.revokedAt && (!binding.expiresAt || binding.expiresAt > now) && binding.role.status === 'ACTIVE'
    )
    const adminTypes = new Set(roles.map((binding) => binding.role.roleType).filter((type: string) => type !== 'BUSINESS'))
    if (adminTypes.size > 1) throw new UnauthorizedException('账户绑定了互斥的管理员职责，请联系安全管理员')
    const grants = roles.flatMap((binding) =>
      binding.role.permissions
        .filter(
          (entry) =>
            !entry.revokedAt && (!entry.expiresAt || entry.expiresAt > now) && roleAllowsPermission(binding.role.roleType, entry.permission)
        )
        .map((entry) => entry.permission)
    )
    const [pages, buttons, pageApis, buttonApis] = grants.length
      ? await Promise.all([
          this.prisma.systemFunction.findMany({
            select: { id: true, parentId: true, permissionId: true, status: true },
          }),
          this.prisma.functionButton.findMany({
            select: { id: true, functionId: true, permissionId: true, status: true },
          }),
          this.prisma.functionApi.findMany(),
          this.prisma.buttonApi.findMany(),
        ])
      : [[], [], [], []]
    const effective = effectivePermissions(grants, pages, buttons, pageApis, buttonApis)
    return {
      internalId: user.id,
      userId: user.userId,
      username: user.username,
      displayName: user.displayName,
      status: user.status,
      failedLogins: user.failedLogins,
      lastLoginAt: user.lastLoginAt || null,
      lastLoginIp: user.lastLoginIp || null,
      roles: roles.map((item) => ({
        roleId: item.role.roleId,
        code: item.role.code,
        name: item.role.name,
        roleType: item.role.roleType,
      })),
      permissions: [...new Set(effective.map((permission) => permission.code))],
      apiPermissions: effective
        .filter((permission) => permission.type === 'API')
        .map(({ code, method, path, requiredRoleType }) => ({
          code,
          method,
          path,
          requiredRoleType,
        })),
      mfaEnabled: user.mfaEnabled,
      mfaRequired: adminTypes.size > 0,
      tenantId: user.tenantId,
      departmentId: user.departmentId,
      organizationId: user.organizationId,
      isSuperAdmin: false,
    }
  }
}
