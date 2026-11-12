import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClamAvFileScanner } from '#app/modules/file/clamav-file-scanner.js'
import { FILE_SCAN_POLICY } from '#app/modules/file/file-scan-policy.js'

const state = vi.hoisted(() => ({ version: 'ClamAV 1.4.3/27999/Thu Nov 12 00:00:00 2026', scan: 'stream: OK', sockets: [] as any[], fail: false }))
vi.mock('node:net', () => ({
  createConnection: () => {
    const socket = new EventEmitter() as any
    socket.command = ''
    socket.chunks = []
    socket.setTimeout = vi.fn()
    socket.destroy = vi.fn(() => queueMicrotask(() => socket.emit('close')))
    socket.write = vi.fn((data: Buffer, callback?: (error?: Error) => void) => {
      if (data.toString() === 'zVERSION\0') {
        socket.command = 'VERSION'
        queueMicrotask(() => socket.emit('data', Buffer.from(state.version + '\0')))
      } else if (data.toString() === 'zINSTREAM\0') socket.command = 'INSTREAM'
      else if (data.length === 4 && data.readUInt32BE() === 0) queueMicrotask(() => socket.emit('data', Buffer.from(state.scan + '\0')))
      else socket.chunks.push(data)
      callback?.()
      return true
    })
    state.sockets.push(socket)
    queueMicrotask(() => socket.emit(state.fail ? 'error' : 'connect', ...(state.fail ? [new Error('unavailable')] : [])))
    return socket
  },
}))

beforeEach(() => { state.version = 'ClamAV 1.4.3/27999/Thu Nov 12 00:00:00 2026'; state.scan = 'stream: OK'; state.sockets = []; state.fail = false })
afterEach(() => vi.restoreAllMocks())
const scan = () => new ClamAvFileScanner().scan({ stream: Readable.from([Buffer.from('test')]), size: 4n })

describe('ClamAV versioned scan results', () => {
  it('queries VERSION and saves the actual engine version and applied policy revision', async () => {
    expect(await scan()).toEqual({ verdict: 'CLEAN', detail: 'OK', engineVersion: 'ClamAV 1.4.3', policyVersion: FILE_SCAN_POLICY.version })
    expect(state.sockets.map((socket) => socket.command)).toEqual(['VERSION', 'INSTREAM'])
    expect(state.sockets.every((socket) => socket.destroy.mock.calls.length === 1)).toBe(true)
    expect(state.sockets[1].chunks[0].subarray(4).toString()).toBe('test')
  })

  it('refreshes the engine version for each scan rather than persisting a cached version after upgrades', async () => {
    await scan()
    state.version = 'ClamAV 1.5.0/28000/Thu Nov 12 01:00:00 2026'
    expect(await scan()).toMatchObject({ engineVersion: 'ClamAV 1.5.0' })
  })

  it('includes versions in infected results', async () => {
    state.scan = 'stream: Eicar-Signature FOUND'
    expect(await scan()).toMatchObject({ verdict: 'INFECTED', engineVersion: 'ClamAV 1.4.3', policyVersion: FILE_SCAN_POLICY.version })
  })

  it.each(['COMMAND UNAVAILABLE', 'clamav', 'ClamAV ', 'ClamAV ' + '1'.repeat(70)])('rejects an unavailable or malformed version: %s', async (version) => {
    state.version = version
    expect(await scan()).toMatchObject({ verdict: 'ERROR', policyVersion: FILE_SCAN_POLICY.version })
    expect(state.sockets).toHaveLength(1)
  })

  it.each(['stream: unexpected OK', 'UNKNOWN COMMAND', 'stream: read failure ERROR'])('does not release files on ambiguous scan responses: %s', async (response) => {
    state.scan = response
    expect(await scan()).toMatchObject({ verdict: 'ERROR', engineVersion: 'ClamAV 1.4.3', policyVersion: FILE_SCAN_POLICY.version })
  })

  it('returns a versioned policy error when the daemon cannot be reached', async () => {
    state.fail = true
    expect(await scan()).toMatchObject({ verdict: 'ERROR', policyVersion: FILE_SCAN_POLICY.version })
  })
})
