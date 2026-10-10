import request from './http'

export function getMyUploadedFiles(params) {
  return request({
    url: '/files/uploads/mine',
    method: 'get',
    params,
  })
}

export function initiateFileUpload(data) {
  return request({
    url: '/files/uploads/initiate',
    method: 'post',
    data,
  })
}

export function getFileUploadStatus(uploadId) {
  return request({
    url: `/files/uploads/${uploadId}/status`,
    method: 'get',
  })
}

export function uploadFilePart(uploadId, partNumber, blob, onUploadProgress) {
  return request({
    url: `/files/uploads/${uploadId}/parts/${partNumber}`,
    method: 'put',
    data: blob,
    headers: {
      'Content-Type': 'application/octet-stream',
    },
    timeout: 0,
    onUploadProgress,
  })
}

export function completeFileUpload(uploadId, clientSha256) {
  return request({
    url: `/files/uploads/${uploadId}/complete`,
    method: 'post',
    data: clientSha256 ? { clientSha256 } : {},
  })
}

export function abortFileUpload(uploadId) {
  return request({
    url: `/files/uploads/${uploadId}/abort`,
    method: 'post',
  })
}
