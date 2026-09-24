import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../database/prisma.service.js'
import { RedisService } from '../cache/services/redis.service.js'

@Injectable()
export class SystemHealthService {
  private readonly logger = new Logger(SystemHealthService.name)
  private readonly captchaUrl = (process.env.CAPTCHA_SERVICE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '')
  private readonly timeoutMs = Number(process.env.CAPTCHA_SERVICE_TIMEOUT_MS || 2000)

  constructor(private readonly prisma: PrismaService, private readonly redis: RedisService) {}

  async status() {
    const checkedAt = new Date().toISOString()
    const [mysql, redis, captcha] = await Promise.all([
      this.checkMysql(),
      this.checkRedis(),
      this.checkCaptchaService(),
    ])
    const services = [
      { name: 'backend', status: 'ok' as const, latencyMs: 0, checkedAt, impact: '所有后台管理功能' },
      { ...mysql, name: 'mysql', impact: '用户、权限、审计和业务数据' },
      { ...redis, name: 'redis', impact: '会话、限流、MFA 和验证码流程' },
      { ...captcha, name: 'captcha-service', impact: '行为验证码和登录保护' },
    ]
    const status = services.some((service) => service.status === 'unavailable')
      ? services.some((service) => service.name === 'mysql' && service.status === 'unavailable')
        ? 'unavailable'
        : 'degraded'
      : 'ok'
    return {
      status,
      checkedAt,
      services,
    }
  }

  private async checkMysql() {
    const started = Date.now()
    try {
      await this.prisma.$queryRaw`SELECT 1`
      return { status: 'ok' as const, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() }
    } catch (error) {
      this.logger.warn(`mysql readiness check failed: ${error instanceof Error ? error.message : String(error)}`)
      return { status: 'unavailable' as const, latencyMs: null, checkedAt: new Date().toISOString() }
    }
  }

  private async checkRedis() {
    const started = Date.now()
    try {
      if (!(await this.redis.ready())) throw new Error('redis is not ready')
      return { status: 'ok' as const, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() }
    } catch (error) {
      this.logger.warn(`redis readiness check failed: ${error instanceof Error ? error.message : String(error)}`)
      return { status: 'unavailable' as const, latencyMs: null, checkedAt: new Date().toISOString() }
    }
  }

  private async checkCaptchaService() {
    const started = Date.now()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await fetch(`${this.captchaUrl}/ready`, { signal: controller.signal })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return { status: 'ok' as const, latencyMs: Date.now() - started, checkedAt: new Date().toISOString() }
    } catch (error) {
      this.logger.warn(`captcha-service readiness check failed: ${error instanceof Error ? error.message : String(error)}`)
      return { status: 'unavailable' as const, latencyMs: null, checkedAt: new Date().toISOString() }
    } finally {
      clearTimeout(timer)
    }
  }
}
