import { Injectable } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat, open, link, chmod } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { Transform } from 'node:stream'
import type { Readable } from 'node:stream'

const storageRoot = () => resolve(process.env.FILE_STORAGE_ROOT || resolve(process.cwd(), '.data/uploads'))

@Injectable()
export class FileStorageService {
  private readonly root = storageRoot()

  private partPath(uploadId: string, partNumber: number) {
    return resolve(this.root, 'quarantine', uploadId, 'parts', `${partNumber}.part`)
  }

  private finalPath(storageKey: string) {
    const path = resolve(this.root, 'objects', storageKey)
    if (!path.startsWith(resolve(this.root, 'objects') + '/')) throw new Error('非法存储路径')
    return path
  }

  private quarantineObjectPath(uploadId: string) {
    return resolve(this.root, 'quarantine', uploadId, 'object')
  }

  async writePart(uploadId: string, partNumber: number, input: Readable, expectedSize: number) {
    const path = this.partPath(uploadId, partNumber)
    await mkdir(dirname(path), { recursive: true, mode: 0o750 })
    let bytes = 0
    const hash = createHash('sha256')
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        bytes += chunk.length
        if (bytes > expectedSize) return callback(new Error('分片大小超过声明值'))
        hash.update(chunk)
        callback(null, chunk)
      },
    })
    await pipeline(input, counter, createWriteStream(path, { flags: 'w', mode: 0o640 }))
    if (bytes !== expectedSize) {
      await rm(path, { force: true })
      throw new Error('分片大小与声明不一致')
    }
    return { size: bytes, checksum: hash.digest('hex'), path }
  }

  async readPart(uploadId: string, partNumber: number) {
    return createReadStream(this.partPath(uploadId, partNumber))
  }

  async readObject(storageKey: string) {
    return createReadStream(this.finalPath(storageKey))
  }

  async readQuarantine(uploadId: string) {
    return createReadStream(this.quarantineObjectPath(uploadId))
  }

  async mergeToQuarantine(uploadId: string, totalParts: number) {
    const target = this.quarantineObjectPath(uploadId)
    const temp = `${target}.partial`
    await mkdir(dirname(target), { recursive: true, mode: 0o750 })
    const hash = createHash('sha256')
    const output = createWriteStream(temp, { flags: 'w', mode: 0o640 })
    try {
      for (let part = 1; part <= totalParts; part++) {
        const input = await this.readPart(uploadId, part)
        const digest = new Transform({
          transform(chunk, _encoding, callback) {
            hash.update(chunk)
            callback(null, chunk)
          },
        })
        await pipeline(input, digest, output, { end: false })
      }
      output.end()
      await new Promise<void>((resolvePromise, reject) => {
        output.once('finish', resolvePromise)
        output.once('error', reject)
      })
      await chmod(temp, 0o440)
      await rename(temp, target)
      return { checksum: hash.digest('hex'), size: (await stat(target)).size }
    } catch (error) {
      output.destroy()
      await rm(temp, { force: true })
      throw error
    }
  }

  // Open an immutable inode with an independent file descriptor for each scan.
  // No per-attempt content copy, including for large files.
  async openScanSource(uploadId: string, storageKey: string, signal: AbortSignal) {
    signal.throwIfAborted()
    let handle
    try { handle = await open(this.finalPath(storageKey), 'r') }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      handle = await open(this.quarantineObjectPath(uploadId), 'r')
    }
    try {
      const identity = await handle.stat()
      signal.throwIfAborted()
      const source = handle
      return Object.assign(handle.createReadStream({ signal, autoClose: false }), {
        scanIdentity: { dev: identity.dev, ino: identity.ino },
        closeScanSource: () => source.close(),
      })
    }
    catch (error) { await handle.close(); throw error }
  }

  async publishScannedSource(uploadId: string, storageKey: string, signal: AbortSignal, identity: { dev: number; ino: number }) {
    signal.throwIfAborted()
    const target = this.finalPath(storageKey)
    await mkdir(dirname(target), { recursive: true, mode: 0o750 })
    try {
      // An exclusive hard link publishes the same immutable inode without a
      // copy or an overwrite. Quarantine and objects must share a filesystem.
      await link(this.quarantineObjectPath(uploadId), target)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
        // A completed upload may already have been cleaned from quarantine.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        await stat(target)
      }
    }
    const published = await stat(target)
    if (published.dev !== identity.dev || published.ino !== identity.ino) throw new Error('扫描源与发布文件不一致')
    signal.throwIfAborted()
  }

  async removeUpload(uploadId: string) {
    await rm(resolve(this.root, 'quarantine', uploadId), { recursive: true, force: true })
  }

  async size(storageKey: string) {
    return (await stat(this.finalPath(storageKey))).size
  }
}
