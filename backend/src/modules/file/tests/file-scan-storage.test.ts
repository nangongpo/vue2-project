import { mkdtemp, mkdir, writeFile, stat, rm } from 'node:fs/promises'
import type { Readable } from 'node:stream'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FileStorageService } from '#app/modules/file/file-storage.service.js'
let root = ''
afterEach(async () => { vi.unstubAllEnvs(); if (root) await rm(root, { recursive: true, force: true }) })
describe('immutable scan storage', () => {
  it('opens independent descriptors and publishes the same inode without a full file copy', async () => {
    root = await mkdtemp(join(tmpdir(), 'scan-storage-'))
    vi.stubEnv('FILE_STORAGE_ROOT', root)
    const dir = join(root, 'quarantine', 'upload')
    await mkdir(dir, { recursive: true }); await writeFile(join(dir, 'object'), Buffer.alloc(1024 * 1024, 7))
    const storage = new FileStorageService(); const signal = new AbortController().signal
    const first = await storage.openScanSource('upload', 'key', signal)
    const second = await storage.openScanSource('upload', 'key', signal)
    const consume = async (stream: Readable) => { let length = 0; for await (const chunk of stream) length += chunk.length; return length }
    await storage.publishScannedSource('upload', 'key', signal, first.scanIdentity)
    expect(await Promise.all([consume(first), consume(second)])).toEqual([1024 * 1024, 1024 * 1024])
    expect((await stat(join(root, 'objects', 'key'))).ino).toBe((await stat(join(dir, 'object'))).ino)
    await storage.publishScannedSource('upload', 'key', signal, first.scanIdentity)
    const third = await storage.openScanSource('upload', 'key', signal)
    expect(await consume(third)).toBe(1024 * 1024)
    await Promise.all([first.closeScanSource(), second.closeScanSource(), third.closeScanSource()])
  })
  it('cancels a scan read without closing another execution descriptor', async () => {
    root = await mkdtemp(join(tmpdir(), 'scan-abort-')); vi.stubEnv('FILE_STORAGE_ROOT', root)
    await mkdir(join(root, 'objects'), { recursive: true }); await writeFile(join(root, 'objects', 'key'), 'test')
    const storage = new FileStorageService(); const abort = new AbortController()
    const first = await storage.openScanSource('upload', 'key', abort.signal)
    const errors = new Promise((resolve) => first.once('error', resolve)); abort.abort(); await errors
    const second = await storage.openScanSource('upload', 'key', new AbortController().signal)
    const chunks: Buffer[] = []; for await (const chunk of second) chunks.push(chunk)
    expect(Buffer.concat(chunks).toString()).toBe('test')
    await Promise.all([first.closeScanSource(), second.closeScanSource()])
  })
  it('refuses to publish a different inode if the quarantine path changes after scanning', async () => {
    root = await mkdtemp(join(tmpdir(), 'scan-identity-')); vi.stubEnv('FILE_STORAGE_ROOT', root)
    const dir = join(root, 'quarantine', 'upload'); await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'object'), 'original')
    const storage = new FileStorageService(); const signal = new AbortController().signal
    const stream = await storage.openScanSource('upload', 'key', signal)
    stream.on('error', () => {})
    await rm(join(dir, 'object')); await writeFile(join(dir, 'object'), 'replacement')
    await expect(storage.publishScannedSource('upload', 'key', signal, stream.scanIdentity)).rejects.toThrow('扫描源与发布文件不一致')
    stream.destroy()
    await stream.closeScanSource()
  })

})
