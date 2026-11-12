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
  INFECTED: 'INFECTED',
  ERROR: 'ERROR',
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
  const infected = scanStatus === FILE_SCAN_STATUS.INFECTED
  const terminal = ready || infected || TERMINAL_UPLOAD_STATUSES.has(uploadStatus) || TERMINAL_FILE_STATUSES.has(fileStatus)

  let text = '文件正在处理中'
  if (ready) text = '扫描通过，文件已可用'
  else if (fileStatus === FILE_STATUS.DELETED) text = '文件已删除，不可使用'
  else if (infected) text = '检测到病毒，文件已拒绝，不可使用'
  else if (fileStatus === FILE_STATUS.REJECTED) text = '文件已拒绝，不可使用'
  else if (uploadStatus === FILE_UPLOAD_STATUS.ABORTED) text = '上传已中止'
  else if (uploadStatus === FILE_UPLOAD_STATUS.EXPIRED) text = '上传会话已过期，请重新上传'
  else if (uploadStatus === FILE_UPLOAD_STATUS.FAILED) text = scanStatus === FILE_SCAN_STATUS.ERROR
    ? '安全扫描异常，文件暂不可用，请联系管理员处理'
    : '文件处理失败，请重新上传或联系管理员'
  else if (uploadStatus === FILE_UPLOAD_STATUS.FINALIZING) text = '正在校验文件'
  else if (uploadStatus === FILE_UPLOAD_STATUS.SCANNING || fileStatus === FILE_STATUS.QUARANTINED) text = scanStatus === FILE_SCAN_STATUS.ERROR
    ? '安全扫描异常，正在自动重试'
    : '等待安全扫描'

  return {
    uploadStatus,
    fileStatus,
    scanStatus,
    ready,
    terminal,
    text,
    tone: ready ? 'success' : terminal ? 'error' : 'info',
  }
}

