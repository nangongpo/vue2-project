import 'reflect-metadata'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { timingSafeEqual } from 'node:crypto'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import Joi from 'joi'
import { AppModule } from './app.module.js'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

// 兼容 Node 20/22：Node 20 没有 node:process.loadEnvFile，部署环境已有变量时不覆盖。
const envFile = resolve(process.cwd(), '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match && process.env[match[1]] === undefined)
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

const env = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  CAPTCHA_PORT: Joi.number().port().default(3100),
  CAPTCHA_HOST: Joi.string().default('127.0.0.1'),
  CAPTCHA_SERVICE_ID: Joi.string().min(1).default('backend-admin'),
  CAPTCHA_SERVICE_SECRET: Joi.string()
    .min(1)
    .default('development-secret-change-me')
    .when('NODE_ENV', { is: 'production', then: Joi.string().min(32).required() }),
  CAPTCHA_PREFIX: Joi.string()
    .pattern(/^[a-z0-9]{4,32}$/)
    .default('yaxbgo'),
  CAPTCHA_SERVICE_BINDINGS: Joi.string().allow('').default(''),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .required(),
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  CAPTCHA_CHALLENGE_RATE_LIMIT: Joi.number().integer().min(1).max(100).default(10),
  CAPTCHA_VERIFY_RATE_LIMIT: Joi.number().integer().min(1).max(300).default(30),
  CAPTCHA_VERIFY_ATTEMPT_LIMIT: Joi.number().integer().min(1).max(10).default(3),
  CAPTCHA_FAILURE_COOLDOWN_SECONDS: Joi.number().integer().min(10).max(300).default(30),
  CAPTCHA_CONSUME_RATE_LIMIT: Joi.number().integer().min(1).max(300).default(30),
  CAPTCHA_CHALLENGE_TTL: Joi.number().integer().min(30).max(600).default(120),
  CAPTCHA_TOKEN_TTL: Joi.number().integer().min(30).max(600).default(120),
  CAPTCHA_MAX_TRACK_POINTS: Joi.number().integer().min(8).max(1000).default(300),
  CAPTCHA_CANVAS_WIDTH: Joi.number().integer().min(240).max(800).default(360),
  CAPTCHA_CANVAS_HEIGHT: Joi.number().integer().min(100).max(400).default(120),
  CAPTCHA_TRACK_WIDTH: Joi.number().integer().min(100).max(1000).default(360),
  CAPTCHA_BUTTON_WIDTH: Joi.number().integer().min(20).max(100).default(42),
  CAPTCHA_PIECE_SIZE: Joi.number().integer().min(30).max(80).default(44),
  SWAGGER_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  SWAGGER_ADMIN_USERNAME: Joi.string().min(1).default('admin'),
  SWAGGER_ADMIN_PASSWORD: Joi.string().min(12).default('change-this-swagger-password'),
})
  .unknown(true)
  .validate(process.env, { abortEarly: false, convert: true })

if (env.error)
  throw new Error(
    `验证码服务环境变量错误: ${env.error.details.map((item) => item.message).join('；')}`
  )
if (env.value.NODE_ENV === 'production' && ['0.0.0.0', '::'].includes(env.value.CAPTCHA_HOST))
  throw new Error('生产环境 CAPTCHA_HOST 不得绑定公网通配地址，必须使用内网或回环地址')
if (
  env.value.NODE_ENV === 'production' &&
  (env.value.SWAGGER_ADMIN_PASSWORD === 'change-this-swagger-password' ||
    env.value.SWAGGER_ADMIN_PASSWORD.length < 16)
)
  throw new Error('生产环境必须配置至少 16 位且非默认的 SWAGGER_ADMIN_PASSWORD')
Object.assign(process.env, env.value)

const app = await NestFactory.create<NestFastifyApplication>(
  AppModule,
  new FastifyAdapter({ logger: false })
)
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
  })
)
const swaggerConfig = new DocumentBuilder()
  .setTitle('Captcha Service API')
  .setDescription('内部验证码服务接口。仅允许 backend 使用服务身份和 HMAC-SHA256 签名调用。')
  .setVersion('1.0')
  .addBasicAuth({ type: 'http', scheme: 'basic', description: '用户名填写 ServiceId，密码填写 CAPTCHA_SERVICE_SECRET' }, 'service-auth')
  .build()
const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig)
const docsPath = '/docs'
const docsJsonPath = '/docs-json'
const isDocsRequest = (url: string) => {
  const path = url.split('?')[0]
  return path === docsPath || path.startsWith(`${docsPath}/`) || path === docsJsonPath
}
const unauthorized = (reply: { code: (status: number) => { header: (name: string, value: string) => { send: (body: string) => void } } }) =>
  reply.code(401).header('WWW-Authenticate', 'Basic realm="captcha-service Swagger"').send('Unauthorized')
app.getHttpAdapter().getInstance().addHook('onRequest', async (request, reply) => {
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
  customSiteTitle: 'Captcha Service API 文档',
  swaggerOptions: {
    persistAuthorization: true,
    requestInterceptor: async (request: { url?: string; method?: string; headers?: Record<string, string>; body?: string }) => {
      const headers = request.headers || {}
      const authorization = headers.Authorization || headers.authorization
      if (!authorization?.startsWith('Basic ')) return request
      const credentials = atob(authorization.slice(6))
      const separator = credentials.indexOf(':')
      const serviceId = separator >= 0 ? credentials.slice(0, separator) : ''
      const secret = separator >= 0 ? credentials.slice(separator + 1) : ''
      delete headers.Authorization
      delete headers.authorization
      if (!secret || !serviceId || request.method?.toUpperCase() !== 'POST' || !request.body) return request
      const body = JSON.parse(request.body) as Record<string, unknown>
      body.ApiVersion ||= '1'
      body.ProtocolVersion ||= '1.0'
      body.ServiceId = serviceId
      body.Timestamp = Math.floor(Date.now() / 1000)
      body.SignatureMethod = 'HMAC-SHA256'
      body.SignatureVersion = '1.0'
      body.SignatureNonce = crypto.randomUUID()
      const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
      const value = (input: unknown) => Array.isArray(input) || (input !== null && typeof input === 'object') ? JSON.stringify(input) : String(input)
      const canonical = Object.keys(body)
        .filter((key) => key !== 'Signature' && body[key] !== undefined && body[key] !== null)
        .sort()
        .map((key) => `${encode(key)}=${encode(value(body[key]))}`)
        .join('&')
      const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`${secret}&`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${(request.method || 'POST').toUpperCase()}&%2F&${encode(canonical)}`))
      body.Signature = btoa(String.fromCharCode(...new Uint8Array(signature)))
      request.body = JSON.stringify(body)
      return request
    },
  },
})
app.enableShutdownHooks()
await app.listen({ port: Number(process.env.CAPTCHA_PORT), host: process.env.CAPTCHA_HOST })
