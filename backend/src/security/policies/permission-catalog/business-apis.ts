import { apiNameLabel } from '#app/common/constants/api-name-labels.js'
import type { ApiDefinition, HttpMethod, RiskBaseline } from '#app/security/policies/permission-catalog/types.js'

type BusinessApiSpec = {
  method: HttpMethod
  path: `/${string}`
  resource: string
  action: string
  riskBaseline: RiskBaseline
}

const BUSINESS_READ_RISK: RiskBaseline = {
  riskLevel: 'L0',
  requireMfa: false,
  requireReauth: false,
  requireApproval: false,
  requireDualControl: false,
  auditRequired: true,
}

const BUSINESS_WRITE_RISK: RiskBaseline = {
  riskLevel: 'L2',
  requireMfa: true,
  requireReauth: true,
  requireApproval: false,
  requireDualControl: false,
  auditRequired: true,
}

// 分片写入属于已通过 initiate 建立并绑定到当前用户的上传会话续传操作。
// 分片接口仍执行登录态、接口权限、会话归属、状态和大小校验，但不应让大文件的每一片重复触发 L2 验证。
const BUSINESS_UPLOAD_PART_RISK: RiskBaseline = {
  riskLevel: 'L0',
  requireMfa: false,
  requireReauth: false,
  requireApproval: false,
  requireDualControl: false,
  auditRequired: true,
}

const BUSINESS_API_SPECS = {
  'file.upload.read': {
    method: 'GET', path: '/files/uploads/mine', resource: 'file', action: 'read', riskBaseline: BUSINESS_READ_RISK,
  },
  'file.upload.initiate': {
    method: 'POST', path: '/files/uploads/initiate', resource: 'file', action: 'upload.initiate', riskBaseline: BUSINESS_WRITE_RISK,
  },
  'file.upload.part': {
    method: 'PUT', path: '/files/uploads/:uploadId/parts/:partNumber', resource: 'file', action: 'upload.part', riskBaseline: BUSINESS_UPLOAD_PART_RISK,
  },
  'file.upload.status': {
    method: 'GET', path: '/files/uploads/:uploadId/status', resource: 'file', action: 'upload.status', riskBaseline: BUSINESS_READ_RISK,
  },
  'file.upload.complete': {
    method: 'POST', path: '/files/uploads/:uploadId/complete', resource: 'file', action: 'upload.complete', riskBaseline: BUSINESS_WRITE_RISK,
  },
  'file.upload.abort': {
    method: 'POST', path: '/files/uploads/:uploadId/abort', resource: 'file', action: 'upload.abort', riskBaseline: BUSINESS_WRITE_RISK,
  },
  'file.download': {
    method: 'GET', path: '/files/:fileId/download-url', resource: 'file', action: 'download', riskBaseline: BUSINESS_READ_RISK,
  },
} as const satisfies Record<string, BusinessApiSpec>

type BusinessApiCode = keyof typeof BUSINESS_API_SPECS

function businessApi<const Code extends BusinessApiCode>(code: Code): ApiDefinition {
  const spec = BUSINESS_API_SPECS[code]

  return {
    code,
    name: apiNameLabel(code),
    method: spec.method,
    path: `/api/v1${spec.path}`,
    resource: spec.resource,
    action: spec.action,
    rolePolicy: { type: 'SINGLE_ROLE', roleType: 'BUSINESS' },
    riskBaseline: spec.riskBaseline,
  }
}

const businessApiCodes = Object.keys(BUSINESS_API_SPECS) as BusinessApiCode[]

export const BUSINESS_APIS = Object.freeze(businessApiCodes.map((code) => businessApi(code)))

export const BUSINESS_API_CODES = new Set(BUSINESS_APIS.map((entry) => entry.code))
export const BUSINESS_RESOURCE_CODES: ReadonlySet<string> = new Set(BUSINESS_APIS.map((entry) => entry.resource))
