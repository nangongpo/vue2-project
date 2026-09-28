import { axiosGet, axiosPost, sendRequest } from './index'

export const getUsers = (params = {}) => axiosGet('/users', params)
export const createUser = (data) => axiosPost('/users', data)
export const updateUser = (id, data) =>
  sendRequest({ url: `/users/${id}`, method: 'patch', params: data })
export const updateUserRoles = (id, data) =>
  sendRequest({ url: `/users/${id}/roles`, method: 'patch', params: data })
export const enableUser = (id, reason) =>
  sendRequest({ url: `/users/${id}/enable`, method: 'patch', params: { reason } })
export const disableUser = (id, reason) =>
  sendRequest({ url: `/users/${id}/disable`, method: 'patch', params: { reason } })
export const unlockUser = (id, reason) => axiosPost(`/users/${id}/unlock`, { reason })
export const resetUserPassword = (id, password) =>
  axiosPost(`/users/${id}/reset-password`, { password })
export const getRoles = () => axiosGet('/roles')
export const getRoleAssignmentOptions = () => axiosGet('/roles/assignment-options')
export const getRolePermissionOptions = () => axiosGet('/roles/permission-options')
export const getRoleGrants = (id) => axiosGet(`/roles/${id}/grants`)
export const createRole = (data) => axiosPost('/roles', data)
export const updateRole = (id, data) =>
  sendRequest({ url: `/roles/${id}`, method: 'patch', params: data })
export const updateRoleGrants = (id, data) =>
  sendRequest({ url: `/roles/${id}/grants`, method: 'patch', params: data })
export const enableRole = (id, reason) =>
  sendRequest({ url: `/roles/${id}/enable`, method: 'patch', params: { reason } })
export const disableRole = (id, reason) =>
  sendRequest({ url: `/roles/${id}/disable`, method: 'patch', params: { reason } })
export const deleteRole = (id) => sendRequest({ url: `/roles/${id}`, method: 'delete' })
export const getAuditLogs = (params = {}) => axiosGet('/audit-logs', params)
export const getAuditLogDetail = (id) => axiosGet(`/audit-logs/${id}`)
export const exportAuditLogs = (params) => axiosGet('/audit-logs/export', params)
export const getPageTree = () => axiosGet('/permission/pages/tree')
export const getPageBaseApis = (id) => axiosGet(`/permission/pages/${id}/base-apis`)
export const getPageButtons = (id) => axiosGet(`/permission/pages/${id}/buttons`)
export const getPageBaseApiOptions = () => axiosGet('/permission/pages/base-apis/options')
export const getPermissionApis = (params = {}) => axiosGet('/permission/apis', params)
export const getOperationApiOptions = () => axiosGet('/permission/api-options')
export const getOperationActionOptions = () => axiosGet('/permission/buttons/action-options')
export const createPermissionApi = (data) => axiosPost('/permission/apis', data)
export const updatePermissionApi = (id, data) =>
  sendRequest({ url: `/permission/apis/${id}`, method: 'patch', params: data })
export const enablePermissionApi = (id) =>
  sendRequest({ url: `/permission/apis/${id}/enable`, method: 'patch' })
export const disablePermissionApi = (id) =>
  sendRequest({ url: `/permission/apis/${id}/disable`, method: 'patch' })
export const getPermissionApiReferences = (id) => axiosGet(`/permission/apis/${id}/references`)
export const deletePermissionApi = (id) =>
  sendRequest({ url: `/permission/apis/${id}`, method: 'delete' })
export const createPermissionFunction = (data) => axiosPost('/permission/pages', data)
export const createPermissionDirectory = (data) => axiosPost('/permission/directories', data)
export const deletePermissionDirectory = (id) =>
  sendRequest({ url: `/permission/directories/${id}`, method: 'delete' })
export const deletePermissionFunction = (id) =>
  sendRequest({ url: `/permission/pages/${id}`, method: 'delete' })
export const updatePermissionFunction = (id, data) =>
  sendRequest({ url: `/permission/pages/${id}`, method: 'patch', params: data })
export const updatePermissionDirectory = (id, data) =>
  sendRequest({ url: `/permission/directories/${id}`, method: 'patch', params: data })
export const enablePermissionFunction = (id) =>
  sendRequest({ url: `/permission/pages/${id}/enable`, method: 'patch' })
export const disablePermissionFunction = (id) =>
  sendRequest({ url: `/permission/pages/${id}/disable`, method: 'patch' })
export const mapFunctionApis = (id, apiIds) =>
  sendRequest({ url: `/permission/pages/${id}/base-apis`, method: 'patch', params: { apiIds } })
export const createPermissionButton = (data) => axiosPost('/permission/buttons', data)
export const updatePermissionButton = (id, data) =>
  sendRequest({ url: `/permission/buttons/${id}`, method: 'patch', params: data })
export const enablePermissionButton = (id) =>
  sendRequest({ url: `/permission/buttons/${id}/enable`, method: 'patch' })
export const disablePermissionButton = (id) =>
  sendRequest({ url: `/permission/buttons/${id}/disable`, method: 'patch' })
export const mapButtonApis = (id, apiIds) =>
  sendRequest({ url: `/permission/buttons/${id}/apis`, method: 'patch', params: { apiIds } })
export const getPermissionDataFields = (resource) =>
  axiosGet('/permission/fields', resource ? { resource } : {})
export const getDataResources = (resource, status) =>
  axiosGet('/permission/data-resources', {
    ...(resource ? { resource } : {}),
    ...(status ? { status } : {}),
  })
export const createDataResource = (data) => axiosPost('/permission/data-resources', data)
export const updateDataResource = (id, data) =>
  sendRequest({ url: `/permission/data-resources/${id}`, method: 'patch', params: data })
export const enableDataResource = (id) =>
  sendRequest({ url: `/permission/data-resources/${id}/enable`, method: 'patch' })
export const disableDataResource = (id) =>
  sendRequest({ url: `/permission/data-resources/${id}/disable`, method: 'patch' })
export const createPermissionDataField = (data) => axiosPost('/permission/fields', data)
export const enablePermissionDataField = (id) =>
  sendRequest({ url: `/permission/fields/${id}/enable`, method: 'patch' })
export const disablePermissionDataField = (id) =>
  sendRequest({ url: `/permission/fields/${id}/disable`, method: 'patch' })
export const updatePermissionDataField = (id, data) =>
  sendRequest({ url: `/permission/fields/${id}`, method: 'patch', params: data })

export const getApprovals = (params = {}) => axiosGet('/permission/approvals', params)
export const getApprovalTargetOptions = (params = {}) =>
  axiosGet('/permission/approvals/target-options', params)
export const getApproval = (id) => axiosGet(`/permission/approvals/${id}`)
export const createApproval = (data) => axiosPost('/permission/approvals', data)
export const approveRequest = (id, note) =>
  axiosPost(`/permission/approvals/${id}/approve`, { note })
export const executeRequest = (id, note) =>
  axiosPost(`/permission/approvals/${id}/execute`, { note })
export const reviewRequest = (id, note) => axiosPost(`/permission/approvals/${id}/review`, { note })
export const cancelApprovalRequest = (id, note) =>
  axiosPost(`/permission/approvals/${id}/cancel`, { note })
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
