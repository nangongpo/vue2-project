import type { Readable } from 'node:stream'

export type FileScanVerdict = 'CLEAN' | 'INFECTED' | 'ERROR'

export type FileScanResult = {
  verdict: FileScanVerdict
  detail?: string
  engineVersion?: string
  policyVersion?: string
}

export type FileScanInput = {
  stream: Readable
  size: bigint
  sha256?: string | null
}

export interface FileScanner {
  scan(input: FileScanInput): Promise<FileScanResult>
}

export const FILE_SCANNER = Symbol('FILE_SCANNER')
