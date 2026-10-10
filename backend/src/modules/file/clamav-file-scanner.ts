import { Injectable } from '@nestjs/common'
import { createConnection, type Socket } from 'node:net'
import type { FileScanInput, FileScanResult, FileScanner } from '#app/modules/file/file-scanner.js'

const DEFAULT_TIMEOUT_MS = 120_000
const MAX_CLAMAV_CHUNK = 1024 * 1024

function envNumber(name: string, fallback: number) {
  const value = Number(process.env[name])
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

@Injectable()
export class ClamAvFileScanner implements FileScanner {
  async scan(input: FileScanInput): Promise<FileScanResult> {
    const socket = await this.connect()
    const timeoutMs = envNumber('CLAMAV_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
    socket.setTimeout(timeoutMs)
    try {
      socket.write(Buffer.from('zINSTREAM\0', 'ascii'))
      for await (const rawChunk of input.stream) {
        const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk)
        if (!chunk.length) continue
        if (chunk.length <= MAX_CLAMAV_CHUNK) {
          await this.writeChunk(socket, chunk)
          continue
        }
        for (let offset = 0; offset < chunk.length; offset += MAX_CLAMAV_CHUNK) {
          await this.writeChunk(socket, chunk.subarray(offset, Math.min(offset + MAX_CLAMAV_CHUNK, chunk.length)))
        }
      }
      // INSTREAM terminates with a raw uint32 zero, not a length-prefixed
      // empty chunk. Wrapping this in writeChunk would make clamd wait for
      // four more payload bytes until the scan timeout.
      await this.writeTerminator(socket)
      const response = await this.readResponse(socket)
      return this.parseResponse(response)
    } catch (error) {
      return {
        verdict: 'ERROR',
        detail: error instanceof Error ? error.message.slice(0, 512) : 'ClamAV 扫描失败',
        engineVersion: 'clamav',
      }
    } finally {
      socket.destroy()
    }
  }

  private connect() {
    return new Promise<Socket>((resolve, reject) => {
      const timeoutMs = envNumber('CLAMAV_TIMEOUT_MS', DEFAULT_TIMEOUT_MS)
      const socketPath = process.env.CLAMAV_SOCKET_PATH
      const socket = socketPath
        ? createConnection(socketPath)
        : createConnection({ host: process.env.CLAMAV_HOST || '127.0.0.1', port: envNumber('CLAMAV_PORT', 3310) })
      const onError = (error: Error) => { cleanup(); socket.destroy(); reject(error) }
      const onTimeout = () => onError(new Error('ClamAV 连接超时'))
      const cleanup = () => {
        socket.off('error', onError)
        socket.off('timeout', onTimeout)
      }
      socket.setTimeout(timeoutMs, onTimeout)
      socket.once('connect', () => { cleanup(); resolve(socket) })
      socket.once('error', onError)
    })
  }

  private writeChunk(socket: Socket, chunk: Buffer) {
    return new Promise<void>((resolve, reject) => {
      const length = Buffer.alloc(4)
      length.writeUInt32BE(chunk.length, 0)
      const complete = socket.write(Buffer.concat([length, chunk]), (error) => error ? reject(error) : resolve())
      if (!complete) socket.once('drain', resolve)
    })
  }

  private writeTerminator(socket: Socket) {
    return new Promise<void>((resolve, reject) => {
      const complete = socket.write(Buffer.alloc(4), (error) => error ? reject(error) : resolve())
      if (!complete) socket.once('drain', resolve)
    })
  }

  private readResponse(socket: Socket) {
    return new Promise<string>((resolve, reject) => {
      let output = ''
      const onData = (data: Buffer) => {
        output += data.toString('utf8')
        if (output.includes('\0') || output.includes('\n')) {
          cleanup()
          resolve(output.replace(/[\0\r\n]+$/, ''))
        }
      }
      const onError = (error: Error) => { cleanup(); reject(error) }
      const onClose = () => {
        cleanup()
        if (output) resolve(output)
        else reject(new Error('ClamAV 未返回扫描结果'))
      }
      const onTimeout = () => { cleanup(); reject(new Error('ClamAV 扫描超时')) }
      const cleanup = () => {
        socket.off('data', onData)
        socket.off('error', onError)
        socket.off('close', onClose)
        socket.off('timeout', onTimeout)
      }
      socket.on('data', onData)
      socket.once('error', onError)
      socket.once('close', onClose)
      socket.once('timeout', onTimeout)
    })
  }

  private parseResponse(response: string): FileScanResult {
    const detail = response.replace(/^stream:\s*/i, '').trim()
    if (/\bOK$/i.test(detail)) return { verdict: 'CLEAN', detail: 'OK', engineVersion: 'clamav' }
    if (/\bFOUND$/i.test(detail)) return { verdict: 'INFECTED', detail, engineVersion: 'clamav' }
    return { verdict: 'ERROR', detail: detail || 'ClamAV 返回空结果', engineVersion: 'clamav' }
  }
}
