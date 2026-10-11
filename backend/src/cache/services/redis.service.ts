import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { Redis as RedisClient } from 'ioredis'

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client?: RedisClient
  private readonly subscribers = new Set<RedisClient>()
  private initialization: Promise<void> = Promise.resolve()

  configured() {
    return !!process.env.REDIS_URL && process.env.REDIS_ENABLED !== 'false'
  }

  onModuleInit() {
    this.initialization = this.initialize()
    return this.initialization
  }

  private async initialize() {
    const url = process.env.REDIS_URL
    if (!url || process.env.REDIS_ENABLED === 'false') return
    const client = new RedisClient(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    client.on('error', (error: Error) => console.error('[redis] connection error:', error.message))
    try {
      await client.connect()
      this.client = client
    } catch (error) {
      console.error('[redis] unavailable, fallback mode enabled:', (error as Error).message)
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
      console.error('[redis] increment failed:', (error as Error).message)
      return null
    }
  }

  async ready() {
    if (!this.client) return false
    try {
      return (await this.client.ping()) === 'PONG'
    } catch (error) {
      console.error('[redis] readiness check failed:', (error as Error).message)
      return false
    }
  }

  async set(key: string, value: string, ttlSeconds: number) {
    if (!this.client) return false
    try {
      await this.client.set(key, value, 'EX', ttlSeconds)
      return true
    } catch (error) {
      console.error('[redis] set failed:', (error as Error).message)
      return false
    }
  }

  async setIfAbsent(key: string, value: string, ttlSeconds: number) {
    if (!this.client) return null
    try {
      return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK'
    } catch (error) {
      console.error('[redis] conditional set failed:', (error as Error).message)
      return null
    }
  }

  async acquireLock(key: string, value: string, ttlSeconds: number) {
    if (!this.client) return null
    try {
      return (await this.client.set(key, value, 'EX', ttlSeconds, 'NX')) === 'OK'
    } catch (error) {
      console.error('[redis] lock acquire failed:', (error as Error).message)
      return null
    }
  }

  async releaseLock(key: string, value: string) {
    if (!this.client) return false
    try {
      const result = await this.client.eval(
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        1,
        key,
        value
      )
      return result === 1
    } catch (error) {
      console.error('[redis] lock release failed:', (error as Error).message)
      return false
    }
  }

  async get(key: string) {
    if (!this.client) return null
    try {
      return await this.client.get(key)
    } catch (error) {
      console.error('[redis] get failed:', (error as Error).message)
      return null
    }
  }

  async getAndDelete(key: string) {
    if (!this.client) return null
    try {
      return await this.client.getdel(key)
    } catch (error) {
      console.error('[redis] get and delete failed:', (error as Error).message)
      return null
    }
  }

  /** 发布跨实例事件；Redis 不可用时返回 false，由 Outbox 保留并重试。 */
  async publish(channel: string, message: string) {
    if (!this.client) return false
    try {
      await this.client.publish(channel, message)
      return true
    } catch (error) {
      console.error('[redis] publish failed:', (error as Error).message)
      return false
    }
  }

  /** 使用独立订阅连接监听事件，避免阻塞普通命令连接。 */
  async subscribePattern(pattern: string, handler: (channel: string, message: string) => void) {
    await this.initialization
    if (!this.client) return () => undefined
    const subscriber = this.client.duplicate()
    subscriber.on('error', (error: Error) => console.error('[redis] subscriber error:', error.message))
    try {
      await subscriber.connect()
      await subscriber.psubscribe(pattern)
      subscriber.on('pmessage', (_pattern, channel, message) => handler(channel, message))
      this.subscribers.add(subscriber)
      return () => {
        this.subscribers.delete(subscriber)
        void subscriber.quit()
      }
    } catch (error) {
      console.error('[redis] subscribe failed:', (error as Error).message)
      subscriber.disconnect()
      return () => undefined
    }
  }

  async onModuleDestroy() {
    for (const subscriber of this.subscribers) await subscriber.quit()
    this.subscribers.clear()
    if (this.client) await this.client.quit()
  }
}
