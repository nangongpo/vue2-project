import { describe, expect, it } from 'vitest'
import { FILE_STATUS, FILE_UPLOAD_STATUS, resolveFileUploadStatus } from '../../src/constants/file-upload-status.js'

describe('file upload status contract', () => {
  it.each([
    ['FAILED', 'REJECTED', 'INFECTED', '检测到病毒，文件已拒绝，不可使用'],
    ['FAILED', 'REJECTED', 'CLEAN', '文件已拒绝，不可使用'],
    ['FAILED', 'DELETED', 'INFECTED', '文件已删除，不可使用'],
    ['FAILED', 'QUARANTINED', 'ERROR', '安全扫描异常，文件暂不可用，请联系管理员处理'],
    ['FAILED', 'QUARANTINED', 'PENDING', '文件处理失败，请重新上传或联系管理员'],
    ['ABORTED', 'QUARANTINED', 'PENDING', '上传已中止'],
    ['EXPIRED', 'QUARANTINED', 'PENDING', '上传会话已过期，请重新上传'],
  ])('explains terminal state %s/%s/%s without suggesting a blind retry', (uploadStatus, fileStatus, scanStatus, text) => {
    expect(resolveFileUploadStatus({ uploadStatus, fileStatus, scanStatus })).toMatchObject({
      ready: false, terminal: true, tone: 'error', text,
    })
  })

  it('keeps tracking while the server retries a scan error', () => {
    expect(resolveFileUploadStatus({ uploadStatus: 'SCANNING', fileStatus: 'QUARANTINED', scanStatus: 'ERROR' })).toMatchObject({
      terminal: false, tone: 'info', text: '安全扫描异常，正在自动重试',
    })
  })

  it('marks a clean completed upload as ready and terminal', () => {
    expect(resolveFileUploadStatus({
      uploadStatus: FILE_UPLOAD_STATUS.COMPLETED,
      fileStatus: FILE_STATUS.READY,
      scanStatus: 'CLEAN',
    })).toMatchObject({ ready: true, terminal: true, text: '扫描通过，文件已可用' })
  })

  it('keeps quarantined uploads non-terminal while scanning', () => {
    expect(resolveFileUploadStatus({
      uploadStatus: FILE_UPLOAD_STATUS.SCANNING,
      fileStatus: FILE_STATUS.QUARANTINED,
      scanStatus: 'PENDING',
    })).toMatchObject({ ready: false, terminal: false, text: '等待安全扫描' })
  })

  it('does not treat rejected files as ready', () => {
    expect(resolveFileUploadStatus({
      uploadStatus: FILE_UPLOAD_STATUS.COMPLETED,
      fileStatus: FILE_STATUS.REJECTED,
      scanStatus: 'PENDING',
    })).toMatchObject({ ready: false, terminal: true })
  })
})
