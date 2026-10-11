import { sendRequest } from './index'

export function getMyUploadedFiles(params) {
  return sendRequest({
    url: '/files/uploads/mine',
    method: 'get',
    params,
  })
}

export function getUnfinishedFileUploads() {
  return sendRequest({
    url: '/files/uploads/unfinished',
    method: 'get',
  })
}

export function initiateFileUpload(data) {
  return sendRequest({
    url: '/files/uploads/initiate',
    method: 'post',
    params: data,
  })
}

export function getFileUploadStatus(uploadId) {
  return sendRequest({
    url: `/files/uploads/${uploadId}/status`,
    method: 'get',
  })
}

export function uploadFilePart(uploadId, partNumber, blob, onUploadProgress) {
  return sendRequest({
    url: `/files/uploads/${uploadId}/parts/${partNumber}`,
    method: 'put',
    params: blob,
    config: {
      headers: {
        'Content-Type': 'application/octet-stream',
      },
      timeout: 0,
      onUploadProgress,
    },
  })
}

export function completeFileUpload(uploadId, clientSha256) {
  return sendRequest({
    url: `/files/uploads/${uploadId}/complete`,
    method: 'post',
    params: clientSha256 ? { clientSha256 } : {},
  })
}

export function abortFileUpload(uploadId) {
  return sendRequest({
    url: `/files/uploads/${uploadId}/abort`,
    method: 'post',
  })
}
