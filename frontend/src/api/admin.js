import { axiosGet, axiosPost, sendRequest } from './index'

export const getUsers = (params = {}) => axiosGet('/users', params)
export const createUser = (data) => axiosPost('/users', data)
export const updateUser = (id, data) => sendRequest({ url: `/users/${id}`, method: 'patch', params: data })
export const resetUserPassword = (id, password) => axiosPost(`/users/${id}/reset-password`, { password })
export const getRoles = () => axiosGet('/roles')
export const createRole = (data) => axiosPost('/roles', data)
export const updateRole = (id, data) => sendRequest({ url: `/roles/${id}`, method: 'patch', params: data })
export const deleteRole = (id) => sendRequest({ url: `/roles/${id}`, method: 'delete' })
export const getAuditLogs = (params = {}) => axiosGet('/audit-logs', params)
export const getAuditLogDetail = (id) => axiosGet(`/audit-logs/${id}`)
