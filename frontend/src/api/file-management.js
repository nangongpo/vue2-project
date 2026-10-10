import { axiosGet, axiosPost } from './index'

export const getManagedFiles = (params = {}) => {
  const query = { ...params }
  for (const key of ['keyword', 'status', 'scanStatus', 'resourceType', 'resourceId']) {
    if (query[key] === '' || query[key] === null || query[key] === undefined) delete query[key]
  }
  return axiosGet('/files', query)
}
export const getManagedFile = (fileId) => axiosGet(`/files/${fileId}`)
export const rescanManagedFile = (fileId, reason) => axiosPost(`/files/${fileId}/rescan`, { reason })
export const rejectManagedFile = (fileId, reason) => axiosPost(`/files/${fileId}/reject`, { reason })
export const deleteManagedFile = (fileId, reason) => axiosPost(`/files/${fileId}/delete`, { reason })
export const restoreManagedFile = (fileId, reason) => axiosPost(`/files/${fileId}/restore`, { reason })
