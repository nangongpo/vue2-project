import { axiosGet, axiosPost } from './index'

export const getManagedFiles = (params = {}) => {
  const query = { ...params }
  for (const key of ['keyword', 'status', 'scanStatus', 'resourceType', 'resourceId']) {
    if (query[key] === '' || query[key] === null || query[key] === undefined) delete query[key]
  }
  return axiosGet('/files', query)
}
export const getManagedFile = (fileId) => axiosGet(`/files/${fileId}`)
export const rescanManagedFile = (fileId, reason, releaseReason) => axiosPost(`/files/${fileId}/rescan`, { reason, ...(releaseReason ? { releaseReason } : {}) })
export const rejectManagedFile = (fileId, reason) => axiosPost(`/files/${fileId}/reject`, { reason })
export const deleteManagedFile = (fileId, reason) => axiosPost(`/files/${fileId}/delete`, { reason })
export const restoreManagedFile = (fileId, reason, releaseReason) => axiosPost(`/files/${fileId}/restore`, { reason, ...(releaseReason ? { releaseReason } : {}) })

export const getFileScanJobs = (fileId, params) => axiosGet(`/files/${fileId}/scan-jobs`, params, { showNotify: false })
export const getFileScanJob = (fileId, jobId) => axiosGet(`/files/${fileId}/scan-jobs/${jobId}`, {}, { showNotify: false })
export const getFileScanAttempts = (fileId, jobId, params) => axiosGet(`/files/${fileId}/scan-jobs/${jobId}/attempts`, params, { showNotify: false })
