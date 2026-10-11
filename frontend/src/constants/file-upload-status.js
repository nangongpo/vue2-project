export const FILE_UPLOAD_STATUS = Object.freeze({
  UPLOADING: 'UPLOADING',
  FINALIZING: 'FINALIZING',
  SCANNING: 'SCANNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  ABORTED: 'ABORTED',
  EXPIRED: 'EXPIRED',
})

export const FILE_STATUS = Object.freeze({
  QUARANTINED: 'QUARANTINED',
  READY: 'READY',
  REJECTED: 'REJECTED',
  DELETED: 'DELETED',
})

export const FILE_SCAN_STATUS = Object.freeze({
  PENDING: 'PENDING',
  CLEAN: 'CLEAN',
})

const TERMINAL_UPLOAD_STATUSES = new Set([
  FILE_UPLOAD_STATUS.FAILED,
  FILE_UPLOAD_STATUS.ABORTED,
  FILE_UPLOAD_STATUS.EXPIRED,
])

const TERMINAL_FILE_STATUSES = new Set([
  FILE_STATUS.REJECTED,
  FILE_STATUS.DELETED,
])

export function resolveFileUploadStatus(input = {}) {
  const uploadStatus = input.uploadStatus || input.status || FILE_UPLOAD_STATUS.UPLOADING
  const fileStatus = input.fileStatus || FILE_STATUS.QUARANTINED
  const scanStatus = input.scanStatus || FILE_SCAN_STATUS.PENDING
  const ready = uploadStatus === FILE_UPLOAD_STATUS.COMPLETED && fileStatus === FILE_STATUS.READY && scanStatus === FILE_SCAN_STATUS.CLEAN
  const terminal = ready || TERMINAL_UPLOAD_STATUSES.has(uploadStatus) || TERMINAL_FILE_STATUSES.has(fileStatus)

  return {
    uploadStatus,
    fileStatus,
    scanStatus,
    ready,
    terminal,
    text: ready
      ? '扫描通过，文件已可用'
      : uploadStatus === FILE_UPLOAD_STATUS.FAILED
      ? '处理失败，可重试'
      : terminal
      ? `处理结束：${fileStatus}`
      : fileStatus === FILE_STATUS.QUARANTINED
      ? '等待安全扫描'
      : '文件正在处理中',
  }
}

