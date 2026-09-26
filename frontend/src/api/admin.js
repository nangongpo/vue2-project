import { axiosGet, axiosPost, sendRequest } from './index'

export const getUsers = (params = {}) => axiosGet('/users', params)
export const createUser = (data) => axiosPost('/users', data)
export const updateUser = (id, data) =>
  sendRequest({ url: `/users/${id}`, method: 'patch', params: data })
export const updateUserRoles = (id, data) =>
  sendRequest({ url: `/users/${id}/roles`, method: 'patch', params: data })
export const setUserStatus = (id, data) =>
  sendRequest({ url: `/users/${id}/status`, method: 'patch', params: data })
export const unlockUser = (id, reason) => axiosPost(`/users/${id}/unlock`, { reason })
export const resetUserPassword = (id, password) =>
  axiosPost(`/users/${id}/reset-password`, { password })
export const getRoles = () => axiosGet('/roles')
export const getRolePermissionOptions = () => axiosGet('/roles/permission-options')
export const createRole = (data) => axiosPost('/roles', data)
export const updateRole = (id, data) =>
  sendRequest({ url: `/roles/${id}`, method: 'patch', params: data })
export const updateRoleGrants = (id, data) =>
  sendRequest({ url: `/roles/${id}/grants`, method: 'patch', params: data })
export const setRoleStatus = (id, data) =>
  sendRequest({ url: `/roles/${id}/status`, method: 'patch', params: data })
export const deleteRole = (id) => sendRequest({ url: `/roles/${id}`, method: 'delete' })
export const getAuditLogs = (params = {}) => axiosGet('/audit-logs', params)
export const getAuditLogDetail = (id) => axiosGet(`/audit-logs/${id}`)
export const exportAuditLogs = (params) => axiosGet('/audit-logs/export', params)
export const getPermissionFunctions = () => axiosGet('/permission/functions')
export const getPermissionApis = (params = {}) => axiosGet('/permission/apis', params)
export const getPermissionApiOptions = () => axiosGet('/permission/api-options')
export const createPermissionApi = (data) => axiosPost('/permission/apis', data)
export const updatePermissionApi = (id, data) =>
  sendRequest({ url: `/permission/apis/${id}`, method: 'patch', params: data })
export const setPermissionApiStatus = (id, status) =>
  sendRequest({ url: `/permission/apis/${id}/status`, method: 'patch', params: { status } })
export const getPermissionApiReferences = (id) => axiosGet(`/permission/apis/${id}/references`)
export const deletePermissionApi = (id) =>
  sendRequest({ url: `/permission/apis/${id}`, method: 'delete' })
export const createPermissionFunction = (data) => axiosPost('/permission/functions', data)
export const updatePermissionFunction = (id, data) =>
  sendRequest({ url: `/permission/functions/${id}`, method: 'patch', params: data })
export const setPermissionFunctionStatus = (id, status) =>
  sendRequest({ url: `/permission/functions/${id}/status`, method: 'patch', params: { status } })
export const mapFunctionApis = (id, apiIds) =>
  sendRequest({ url: `/permission/functions/${id}/apis`, method: 'patch', params: { apiIds } })
export const createPermissionButton = (data) => axiosPost('/permission/buttons', data)
export const updatePermissionButton = (id, data) =>
  sendRequest({ url: `/permission/buttons/${id}`, method: 'patch', params: data })
export const setPermissionButtonStatus = (id, status) =>
  sendRequest({ url: `/permission/buttons/${id}/status`, method: 'patch', params: { status } })
export const mapButtonApis = (id, apiIds) =>
  sendRequest({ url: `/permission/buttons/${id}/apis`, method: 'patch', params: { apiIds } })
export const getPermissionDataFields = (resource) =>
  axiosGet('/permission/fields', resource ? { resource } : {})
export const setPermissionDataFieldStatus = (id, status) =>
  sendRequest({ url: `/permission/fields/${id}/status`, method: 'patch', params: { status } })
export const updatePermissionDataField = (id, data) =>
  sendRequest({ url: `/permission/fields/${id}`, method: 'patch', params: data })

export const getApprovals = (params = {}) => axiosGet('/permission/approvals', params)
export const getApproval = (id) => axiosGet(`/permission/approvals/${id}`)
export const createApproval = (data) => axiosPost('/permission/approvals', data)
export const approveRequest = (id, note) =>
  axiosPost(`/permission/approvals/${id}/approve`, { note })
export const executeRequest = (id, note) =>
  axiosPost(`/permission/approvals/${id}/execute`, { note })
export const reviewRequest = (id, note) => axiosPost(`/permission/approvals/${id}/review`, { note })
export const getRoleDataScopes = (roleId) => axiosGet(`/permission/roles/${roleId}/data-scopes`)
export const grantRoleDataScope = (roleId, data) =>
  axiosPost(`/permission/roles/${roleId}/data-scopes`, data)
export const revokeRoleDataScope = (roleId, scopeId, reason) =>
  sendRequest({
    url: `/permission/roles/${roleId}/data-scopes/${scopeId}/revoke`,
    method: 'patch',
    params: { reason },
  })

export const getOpsTickets = (params = {}) => axiosGet('/ops-tickets', params)
export const getOpsTicket = (id) => axiosGet(`/ops-tickets/${id}`)
export const createOpsTicket = (data) => axiosPost('/ops-tickets', data)
export const updateOpsTicket = (id, data) =>
  sendRequest({ url: `/ops-tickets/${id}`, method: 'patch', params: data })
export const submitOpsTicket = (id) => axiosPost(`/ops-tickets/${id}/submit`)
export const approveOpsTicket = (id, note) => axiosPost(`/ops-tickets/${id}/approve`, { note })
export const executeOpsTicket = (id, note) => axiosPost(`/ops-tickets/${id}/execute`, { note })
export const reviewOpsTicket = (id, note) => axiosPost(`/ops-tickets/${id}/review`, { note })
export const cancelOpsTicket = (id, note) => axiosPost(`/ops-tickets/${id}/cancel`, { note })
export const addOpsTicketEvidence = (id, data) => axiosPost(`/ops-tickets/${id}/evidence`, data)
export const addOpsTicketExecution = (id, data) => axiosPost(`/ops-tickets/${id}/executions`, data)
