import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Redis as RedisClient } from 'ioredis'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client?: RedisClient
  private retryTimer?: NodeJS.Timeout
  private redisUrl?: string

  async onModuleInit() {
    this.redisUrl = process.env.REDIS_URL
    if (!this.redisUrl || process.env.REDIS_ENABLED === 'false') return
    await this.connect()
    if (!this.client) this.retryTimer = setInterval(() => void this.connect(), 5000)
  }

  private async connect() {
    if (this.client || !this.redisUrl) return
    const client = new RedisClient(this.redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: (times) => Math.min(times * 250, 2000),
    })
    client.on('error', (error) => console.error('[captcha-redis] connection error:', error.message))
    try {
      await client.connect()
      this.client = client
      if (this.retryTimer) {
        clearInterval(this.retryTimer)
        this.retryTimer = undefined
      }
    } catch (error) {
      console.error('[captcha-redis] unavailable:', (error as Error).message)
      client.disconnect()
    }
  }

  async increment(key: string, ttlSeconds: number) {
    if (!this.client) return null
    try {
      const count = await this.client.incr(key)
      if (count === 1) await this.client.expire(key, ttlSeconds)
      return count
    } catch (error) {
      console.error('[captcha-redis] increment failed:', (error as Error).message)
      return null
    }
  }

  async ready() {
    if (!this.client) return false
    try {
      return (await this.client.ping()) === 'PONG'
    } catch {
      return false
    }
  }

  async setOnce(key: string, ttlSeconds: number) {
    if (!this.client) return null
    try {
      return (await this.client.set(key, '1', 'EX', ttlSeconds, 'NX')) === 'OK'
    } catch {
      return null
    }
  }

  async set(key: string, value: string, ttlSeconds: number) {
    if (!this.client) return false
    try {
      await this.client.set(key, value, 'EX', ttlSeconds)
      return true
    } catch (error) {
      console.error('[captcha-redis] set failed:', (error as Error).message)
      return false
    }
  }

  async get(key: string) {
    if (!this.client) return null
    try {
      return await this.client.get(key)
    } catch (error) {
      console.error('[captcha-redis] get failed:', (error as Error).message)
      return null
    }
  }

  async getAndDelete(key: string) {
    if (!this.client) return null
    try {
      return await this.client.getdel(key)
    } catch (error) {
      console.error('[captcha-redis] consume failed:', (error as Error).message)
      return null
    }
  }

  async incrementJsonField(key: string, field: string, max: number) {
    if (!this.client) return null
    try {
      const result = await this.client.eval(
        `local raw = redis.call('get', KEYS[1])
          if not raw then return -1 end
          local value = cjson.decode(raw)
          local current = tonumber(value[ARGV[1]]) or 0
          local next = current + 1
          if next >= tonumber(ARGV[2]) then
            redis.call('del', KEYS[1])
            return next
          end
          value[ARGV[1]] = next
          local ttl = redis.call('ttl', KEYS[1])
          redis.call('set', KEYS[1], cjson.encode(value))
          if ttl > 0 then redis.call('expire', KEYS[1], ttl) end
          return next`,
        1,
        key,
        field,
        String(max)
      )
      return Number(result)
    } catch (error) {
      console.error('[captcha-redis] atomic json increment failed:', (error as Error).message)
      return null
    }
  }

  async onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer)
    if (this.client) await this.client.quit()
  }
}
