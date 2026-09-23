import 'reflect-metadata'
import { loadEnvFile } from 'node:process'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from '@fastify/helmet'
import {
  FastifyAdapter,
  NestFastifyApplication
} from '@nestjs/platform-fastify'
import { AppModule } from './app.module.js'
import { ApiExceptionFilter } from './common/api-exception.filter.js'
import Joi from 'joi'
import { AuditService } from './audit/audit.service.js'
import { TraceIdInterceptor } from './common/trace-id.interceptor.js'

try {
  loadEnvFile()
} catch {
  // 支持通过命令行或部署平台注入环境变量。
}

const env = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['mysql'] })
    .required(),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .allow('')
    .default(''),
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SESSION_TTL_SECONDS: Joi.number().integer().min(300).max(86400).default(1800),
  SESSION_IDLE_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(86400)
    .default(1800),
  API_RATE_LIMIT: Joi.number().integer().min(1).max(10000).default(120),
  API_RATE_WINDOW_SECONDS: Joi.number().integer().min(1).max(3600).default(60),
  LOGIN_FAILURE_LIMIT: Joi.number().integer().min(1).max(20).default(5),
  LOGIN_LOCK_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  LOGIN_RATE_LIMIT: Joi.number().integer().min(1).max(1000).default(10),
  LOGIN_RATE_WINDOW_SECONDS: Joi.number()
    .integer()
    .min(1)
    .max(3600)
    .default(60),
  IDEMPOTENCY_LOCK_SECONDS: Joi.number().integer().min(2).max(60).default(15),
  CAPTCHA_SERVICE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://127.0.0.1:3100'),
  CAPTCHA_SERVICE_ID: Joi.string().min(1).default('backend-admin'),
  CAPTCHA_SERVICE_SECRET: Joi.string().min(1).allow('').default(''),
  CAPTCHA_SERVICE_TIMEOUT_MS: Joi.number()
    .integer()
    .min(200)
    .max(10000)
    .default(2000),
  SEED_ADMIN_USERNAME: Joi.string().min(1).default('admin'),
  SEED_ADMIN_PASSWORD: Joi.string().min(12).default('change-this-password'),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  COOKIE_DOMAIN: Joi.string().allow('').default(''),
  CSRF_ALLOWED_ORIGINS: Joi.string().allow('').default(''),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace')
    .default('info')
})
  .unknown(true)
  .validate(process.env, { abortEarly: false, convert: true })

if (env.error) {
  throw new Error(
    `环境变量配置错误: ${env.error.details.map((item) => item.message).join('；')}`
  )
}
if (env.value.NODE_ENV === 'production' && env.value.COOKIE_SECURE !== true) {
  throw new Error('生产环境必须启用 COOKIE_SECURE=true')
}
if (env.value.NODE_ENV === 'production' && !env.value.CSRF_ALLOWED_ORIGINS) {
  throw new Error('生产环境必须配置 CSRF_ALLOWED_ORIGINS')
}
Object.assign(process.env, env.value)

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false })
  )

  await app.register((await import('@fastify/cookie')).default)
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' }
  })
  app.setGlobalPrefix('api/v1')
  app.enableCors({ origin: false, credentials: true })
  const allowedCustomHeaders = new Set([
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-idempotency-key',
    'idempotency-key'
  ])
  app.getHttpAdapter().getInstance().addHook('onRequest', async (request: { headers: Record<string, string | string[] | undefined> }) => {
    const unsupported = Object.keys(request.headers).find(name => name.startsWith('x-') && !allowedCustomHeaders.has(name))
    if (unsupported) throw new BadRequestException(`不支持的请求头: ${unsupported}`)
  })
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true
    })
  )
  app.useGlobalInterceptors(new TraceIdInterceptor())
  app.useGlobalFilters(new ApiExceptionFilter(app.get(AuditService)))

  const port = Number(process.env.PORT || 3000)
  await app.listen({ port, host: '0.0.0.0' })
}

bootstrap()
