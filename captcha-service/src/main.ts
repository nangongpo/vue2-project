import 'reflect-metadata'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import Joi from 'joi'
import { AppModule } from './app.module.js'

// 兼容 Node 20/22：Node 20 没有 node:process.loadEnvFile，部署环境已有变量时不覆盖。
const envFile = resolve(process.cwd(), '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

const env = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  CAPTCHA_PORT: Joi.number().port().default(3100),
  CAPTCHA_HOST: Joi.string().default('127.0.0.1'),
  CAPTCHA_SERVICE_ID: Joi.string().min(1).default('backend-admin'),
  CAPTCHA_SERVICE_SECRET: Joi.string().min(1).default('development-secret-change-me').when('NODE_ENV', { is: 'production', then: Joi.string().min(32).required() }),
  CAPTCHA_PREFIX: Joi.string().pattern(/^[a-z0-9]{4,32}$/).default('yaxbgo'),
  CAPTCHA_SERVICE_BINDINGS: Joi.string().allow('').default(''),
  REDIS_URL: Joi.string().uri({ scheme: ['redis', 'rediss'] }).required(),
  REDIS_ENABLED: Joi.boolean().truthy('true').falsy('false').default(true),
  CAPTCHA_CHALLENGE_RATE_LIMIT: Joi.number().integer().min(1).max(100).default(10),
  CAPTCHA_VERIFY_RATE_LIMIT: Joi.number().integer().min(1).max(300).default(30),
  CAPTCHA_CONSUME_RATE_LIMIT: Joi.number().integer().min(1).max(300).default(30),
  CAPTCHA_EVENT_RATE_LIMIT: Joi.number().integer().min(1).max(1000).default(120),
  CAPTCHA_CHALLENGE_TTL: Joi.number().integer().min(30).max(600).default(120),
  CAPTCHA_TOKEN_TTL: Joi.number().integer().min(30).max(600).default(120),
  CAPTCHA_MAX_TRACK_POINTS: Joi.number().integer().min(8).max(1000).default(300),
  CAPTCHA_CANVAS_WIDTH: Joi.number().integer().min(240).max(800).default(360),
  CAPTCHA_CANVAS_HEIGHT: Joi.number().integer().min(100).max(400).default(120),
  CAPTCHA_TRACK_WIDTH: Joi.number().integer().min(100).max(1000).default(360),
  CAPTCHA_BUTTON_WIDTH: Joi.number().integer().min(20).max(100).default(42),
  CAPTCHA_PIECE_SIZE: Joi.number().integer().min(30).max(80).default(44),
}).unknown(true).validate(process.env, { abortEarly: false, convert: true })

if (env.error) throw new Error(`验证码服务环境变量错误: ${env.error.details.map(item => item.message).join('；')}`)
Object.assign(process.env, env.value)

const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter({ logger: false }))
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))
app.enableShutdownHooks()
await app.listen({ port: Number(process.env.CAPTCHA_PORT), host: process.env.CAPTCHA_HOST })
