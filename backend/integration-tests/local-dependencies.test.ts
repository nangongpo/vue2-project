import { readFile } from 'node:fs/promises'
import { connect as connectNet } from 'node:net'
import { randomUUID } from 'node:crypto'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import Redis from 'ioredis'

const prisma = new PrismaClient()
const redisUrl = process.env.REDIS_URL
if (!redisUrl) throw new Error('本地集成测试缺少 REDIS_URL')
const redis = new Redis(redisUrl, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
})

function scanWithClamAv(payload: Buffer) {
  return new Promise<string>((resolve, reject) => {
    const socketPath = process.env.CLAMAV_SOCKET_PATH
    const socket = socketPath
      ? connectNet(socketPath)
      : connectNet(Number(process.env.CLAMAV_PORT || 3310), process.env.CLAMAV_HOST || '127.0.0.1')
    const chunks: Buffer[] = []
    let settled = false
    const finish = (callback: () => void) => {
      if (settled) return
      settled = true
      socket.destroy()
      callback()
    }
    socket.setTimeout(Number(process.env.CLAMAV_TIMEOUT_MS || 120000))
    socket.on('connect', () => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(payload.length)
      socket.write(Buffer.from('zINSTREAM\0'))
      socket.write(length)
      socket.write(payload)
      socket.write(Buffer.alloc(4))
    })
    socket.on('data', (chunk) => {
      chunks.push(chunk)
      if (Buffer.concat(chunks).includes(Buffer.from('\0'))) {
        finish(() => resolve(Buffer.concat(chunks).toString('utf8')))
      }
    })
    socket.on('timeout', () => finish(() => reject(new Error('ClamAV connection timed out'))))
    socket.on('error', (error) => finish(() => reject(error)))
  })
}

describe('local dependency integration', () => {
  it('connects to MySQL and verifies the initialized security boundary', async () => {
    const result = await prisma.$queryRaw<Array<{ ok: bigint }>>`SELECT 1 AS ok`
    expect(Number(result[0]?.ok)).toBe(1)

    const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT COLUMN_NAME AS column_name
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'sys_permission_field'
        AND COLUMN_NAME IN ('readable', 'allow_create', 'allow_update')
    `
    expect(columns.map((column) => column.column_name).sort()).toEqual(['allow_create', 'allow_update', 'readable'])

    const tenantCode = process.env.DEFAULT_TENANT_CODE || 'default-tenant'
    const organizationCode = process.env.DEFAULT_ORGANIZATION_CODE || 'default-organization'
    const departmentCode = process.env.DEFAULT_DEPARTMENT_CODE || 'default-department'
    const tenant = await prisma.tenant.findUnique({ where: { code: tenantCode }, select: { id: true, status: true } })
    expect(tenant?.status).toBe('ACTIVE')
    const organization = await prisma.organization.findFirst({
      where: { tenantId: tenant?.id, code: organizationCode, status: 'ACTIVE' },
    })
    const department = await prisma.department.findFirst({
      where: { tenantId: tenant?.id, organizationId: organization?.id, code: departmentCode, status: 'ACTIVE' },
    })
    expect(organization).toBeTruthy()
    expect(department).toBeTruthy()
  })

  it('uses the real Redis instance for an isolated expiring key', async () => {
    await redis.connect()
    expect(await redis.ping()).toBe('PONG')
    const key = `vue2-project:integration:${randomUUID()}`
    try {
      expect(await redis.set(key, 'ok', 'EX', 30, 'NX')).toBe('OK')
      expect(await redis.get(key)).toBe('ok')
      expect(await redis.set(key, 'changed', 'EX', 30, 'NX')).toBeNull()
    } finally {
      await redis.del(key)
    }
  })

  it('detects the EICAR test sample through the real ClamAV service', async () => {
    const sample = await readFile(new URL('../../frontend/test/eicar-test.txt', import.meta.url))
    const result = await scanWithClamAv(sample)
    expect(result).toMatch(/Eicar-Test-Signature|FOUND/i)
  })
})

afterAll(async () => {
  if (redis.status !== 'end') await redis.quit().catch(() => redis.disconnect())
  await prisma.$disconnect()
})
