import 'reflect-metadata'
import { timingSafeEqual } from 'node:crypto'
import { loadEnvFile } from 'node:process'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import helmet from '@fastify/helmet'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module.js'
import { ApiExceptionFilter } from './common/filters/api-exception.filter.js'
import Joi from 'joi'
import { AuditService } from './audit/services/audit.service.js'
import { TraceIdInterceptor } from './common/interceptors/trace-id.interceptor.js'
import { ApiResponseInterceptor } from './common/interceptors/api-response.interceptor.js'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

try {
  loadEnvFile()
} catch {
  // 支持通过命令行或部署平台注入环境变量。
}

const env = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  ENABLE_HTTPS: Joi.boolean().truthy('true').falsy('false').default(false),
  ENABLE_CSP: Joi.boolean().truthy('true').falsy('false').default(false),
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
  SESSION_MAX_CONCURRENT: Joi.number().integer().min(1).max(100).default(3),
  SESSION_IDLE_TTL_SECONDS: Joi.number().integer().min(300).max(86400).default(1800),
  PREAUTH_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  API_RATE_LIMIT: Joi.number().integer().min(1).max(10000).default(120),
  API_RATE_WINDOW_SECONDS: Joi.number().integer().min(1).max(3600).default(60),
  LOGIN_FAILURE_LIMIT: Joi.number().integer().min(1).max(20).default(5),
  LOGIN_LOCK_MINUTES: Joi.number().integer().min(1).max(1440).default(15),
  LOGIN_RATE_LIMIT: Joi.number().integer().min(1).max(1000).default(10),
  LOGIN_RATE_WINDOW_SECONDS: Joi.number().integer().min(1).max(3600).default(60),
  CAPTCHA_RATE_WINDOW_SECONDS: Joi.number().integer().min(1).max(3600).default(60),
  CAPTCHA_CHALLENGE_RATE_LIMIT: Joi.number().integer().min(1).max(1000).default(10),
  CAPTCHA_VERIFY_RATE_LIMIT: Joi.number().integer().min(1).max(1000).default(30),
  IDEMPOTENCY_LOCK_SECONDS: Joi.number().integer().min(2).max(60).default(15),
  CAPTCHA_SERVICE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .default('http://127.0.0.1:3100'),
  CAPTCHA_SERVICE_ID: Joi.string().min(1).default('backend-admin'),
  CAPTCHA_SERVICE_SECRET: Joi.string().min(1).allow('').default(''),
  CAPTCHA_SERVICE_TIMEOUT_MS: Joi.number().integer().min(200).max(10000).default(2000),
  OPS_EXECUTION_SIGNING_SECRET: Joi.string().min(32).allow('').default(''),
  SEED_SECURITY_USERNAME: Joi.string().min(1).default('security-admin'),
  SEED_SECURITY_PASSWORD: Joi.string().min(12).default('change-this-password'),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_ADMIN_USERNAME: Joi.string().min(1).default('swagger-admin'),
  SWAGGER_ADMIN_PASSWORD: Joi.string().min(12).default('change-this-swagger-password'),
  COOKIE_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  COOKIE_DOMAIN: Joi.string().allow('').default(''),
  CSRF_ALLOWED_ORIGINS: Joi.string().allow('').default(''),
  PUBLIC_HTTPS_ORIGIN: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.boolean().truthy('true').falsy('false').default(false),
  LOG_LEVEL: Joi.string().valid('fatal', 'error', 'warn', 'info', 'debug', 'trace').default('info'),
})
  .unknown(true)
  .validate(process.env, { abortEarly: false, convert: true })

if (env.error) {
  throw new Error(`环境变量配置错误: ${env.error.details.map((item) => item.message).join('；')}`)
}
if (env.value.NODE_ENV === 'production' && env.value.COOKIE_SECURE !== true) {
  throw new Error('生产环境必须启用 COOKIE_SECURE=true')
}
if (env.value.NODE_ENV === 'production' && env.value.ENABLE_HTTPS !== true) {
  throw new Error('生产环境必须启用 ENABLE_HTTPS=true')
}
if (env.value.NODE_ENV === 'production' && env.value.ENABLE_CSP !== true) {
  throw new Error('生产环境必须启用 ENABLE_CSP=true')
}
if (
  env.value.NODE_ENV === 'production' &&
  (env.value.SWAGGER_ADMIN_PASSWORD === 'change-this-swagger-password' ||
    env.value.SWAGGER_ADMIN_PASSWORD.length < 12)
) {
  throw new Error('生产环境必须配置至少 12 位且非默认的 SWAGGER_ADMIN_PASSWORD')
}
if (env.value.NODE_ENV === 'production' && !env.value.CSRF_ALLOWED_ORIGINS) {
  throw new Error('生产环境必须配置 CSRF_ALLOWED_ORIGINS')
}
if (env.value.NODE_ENV === 'production') {
  let publicOrigin: URL
  try {
    publicOrigin = new URL(env.value.PUBLIC_HTTPS_ORIGIN)
  } catch {
    throw new Error('生产环境必须配置有效的 PUBLIC_HTTPS_ORIGIN')
  }
  if (publicOrigin.protocol !== 'https:')
    throw new Error('生产环境 PUBLIC_HTTPS_ORIGIN 必须使用 HTTPS')
  if (!env.value.TRUST_PROXY)
    throw new Error('生产环境必须显式配置 TRUST_PROXY=true，以校验反向代理的 HTTPS 协议')
  if (env.value.COOKIE_DOMAIN)
    throw new Error('生产环境 COOKIE_DOMAIN 必须留空，避免扩大会话 Cookie 的作用域')
  const origins = env.value.CSRF_ALLOWED_ORIGINS.split(',').map((item: string) => item.trim())
  for (const origin of origins) {
    let parsed: URL
    try {
      parsed = new URL(origin)
    } catch {
      throw new Error(`生产环境 CSRF_ALLOWED_ORIGINS 包含无效 Origin: ${origin}`)
    }
    if (parsed.protocol !== 'https:' || ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname))
      throw new Error(`生产环境 CSRF_ALLOWED_ORIGINS 必须是非本机 HTTPS Origin: ${origin}`)
  }
  const captchaOrigin = new URL(env.value.CAPTCHA_SERVICE_URL)
  const localCaptchaHosts = ['localhost', '127.0.0.1', '::1']
  if (captchaOrigin.protocol !== 'https:' && !localCaptchaHosts.includes(captchaOrigin.hostname))
    throw new Error('生产环境非本机 CAPTCHA_SERVICE_URL 必须使用 HTTPS')
}
Object.assign(process.env, env.value)

const isProduction = env.value.NODE_ENV === 'production'
const enableHttps = env.value.ENABLE_HTTPS
const enableCsp = env.value.ENABLE_CSP
const publicHttpsOrigin = env.value.PUBLIC_HTTPS_ORIGIN

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: false, trustProxy: env.value.TRUST_PROXY })
  )

  await app.register((await import('@fastify/cookie')).default)
  await app.register(helmet, {
    contentSecurityPolicy: enableCsp
      ? {
          directives: {
            defaultSrc: ["'none'"],
            connectSrc: ["'self'"],
            scriptSrc: ["'none'"],
            styleSrc: ["'none'"],
            imgSrc: ["'none'"],
            fontSrc: ["'none'"],
            workerSrc: ["'none'"],
            objectSrc: ["'none'"],
            baseUri: ["'none'"],
            formAction: ["'none'"],
            frameAncestors: ["'none'"],
          },
        }
      : false,
    crossOriginResourcePolicy: { policy: 'same-site' },
    hsts: enableHttps ? { maxAge: 63072000, includeSubDomains: true, preload: false } : false,
  })
  app.setGlobalPrefix('api/v1')
  const swaggerConfig = new DocumentBuilder()
    .setTitle('后台管理 API')
    .setDescription('后台管理、认证、权限、审计和验证码代理接口。')
    .setVersion('1.0')
    .addCookieAuth('session', { type: 'apiKey', in: 'cookie', name: 'session' })
    .build()
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig)
  const apiResponseSchema = {
    type: 'object',
    properties: {
      code: { type: 'string', example: '000000', description: '业务结果码，000000 表示成功。' },
      message: { type: 'string', example: 'success', description: '结果说明。' },
      data: { nullable: true, description: '接口业务数据，具体结构由接口定义。' },
    },
    required: ['code', 'message', 'data'],
  }
  for (const pathItem of Object.values(swaggerDocument.paths || {}) as Array<Record<string, any>>) {
    for (const operation of Object.values(pathItem)) {
      if (!operation || typeof operation !== 'object' || !operation.responses) continue
      for (const response of Object.values(operation.responses) as Array<Record<string, any>>) {
        if (!response.content) {
          response.content = { 'application/json': { schema: apiResponseSchema } }
        }
      }
    }
  }
  const docsPath = '/docs'
  const docsJsonPath = '/docs-json'
  const isDocsRequest = (url: string) => {
    const path = url.split('?')[0]
    return path === docsPath || path.startsWith(`${docsPath}/`) || path === docsJsonPath
  }
  const unauthorized = (reply: {
    code: (status: number) => {
      header: (name: string, value: string) => { send: (body: string) => void }
    }
  }) => reply.code(401).header('WWW-Authenticate', 'Basic realm="backend Swagger"').send('Unauthorized')
  app
    .getHttpAdapter()
    .getInstance()
    .addHook('onRequest', async (request, reply) => {
      if (!isDocsRequest(request.url)) return
      if (!env.value.SWAGGER_ENABLED) {
        reply.code(404).send()
        return
      }
      const header = request.headers.authorization
      if (!header?.startsWith('Basic ')) return unauthorized(reply)
      let decoded: string
      try {
        decoded = Buffer.from(header.slice(6), 'base64').toString('utf8')
      } catch {
        return unauthorized(reply)
      }
      const separator = decoded.indexOf(':')
      const username = separator >= 0 ? decoded.slice(0, separator) : ''
      const password = separator >= 0 ? decoded.slice(separator + 1) : ''
      const matches = (actual: string, expected: string) => {
        const actualBuffer = Buffer.from(actual)
        const expectedBuffer = Buffer.from(expected)
        return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
      }
      if (!matches(username, env.value.SWAGGER_ADMIN_USERNAME) || !matches(password, env.value.SWAGGER_ADMIN_PASSWORD))
        return unauthorized(reply)
    })
  SwaggerModule.setup('docs', app, swaggerDocument, {
    jsonDocumentUrl: 'docs-json',
    customSiteTitle: '后台管理 API 文档',
  })
  app.enableCors({ origin: false, credentials: true })
  const allowedCustomHeaders = new Set([
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-idempotency-key',
    'idempotency-key',
  ])
  app
    .getHttpAdapter()
    .getInstance()
    .addHook(
      'onRequest',
      async (request: { headers: Record<string, string | string[] | undefined> }) => {
        const unsupported = Object.keys(request.headers).find(
          (name) => name.startsWith('x-') && !allowedCustomHeaders.has(name)
        )
        if (unsupported) throw new BadRequestException(`不支持的请求头: ${unsupported}`)
      }
    )
  if (isProduction && enableHttps) {
    app
      .getHttpAdapter()
      .getInstance()
      .addHook('onRequest', async (request, reply) => {
        if (request.protocol !== 'https') {
          reply.redirect(`${publicHttpsOrigin}${request.url}`, 308)
        }
      })
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
    })
  )
  app.useGlobalInterceptors(new TraceIdInterceptor())
  app.useGlobalInterceptors(new ApiResponseInterceptor())
  app.useGlobalFilters(new ApiExceptionFilter(app.get(AuditService)))

  const port = Number(process.env.PORT || 3000)
  await app.listen({ port, host: '0.0.0.0' })
}

bootstrap()
