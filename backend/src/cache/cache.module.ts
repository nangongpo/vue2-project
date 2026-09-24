import { Global, Module } from '@nestjs/common'
import { RedisService } from './services/redis.service.js'

/** 缓存模块：提供 Redis 连接、限频、分布式锁和幂等控制能力。 */
@Global()
@Module({ providers: [RedisService], exports: [RedisService] })
export class CacheModule {}
