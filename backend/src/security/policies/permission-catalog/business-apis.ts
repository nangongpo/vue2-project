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

const BUSINESS_API_SPECS = {
  'order.read': { method: 'GET', path: '/orders', resource: 'order', action: 'read', riskBaseline: BUSINESS_READ_RISK },
  'order.create': {
    method: 'POST',
    path: '/orders',
    resource: 'order',
    action: 'create',
    riskBaseline: BUSINESS_WRITE_RISK,
  },
  'order.update': {
    method: 'PATCH',
    path: '/orders/:id',
    resource: 'order',
    action: 'update',
    riskBaseline: BUSINESS_WRITE_RISK,
  },
  'order.confirm': {
    method: 'POST',
    path: '/orders/:id/confirm',
    resource: 'order',
    action: 'confirm',
    riskBaseline: BUSINESS_WRITE_RISK,
  },
  'order.cancel': {
    method: 'POST',
    path: '/orders/:id/cancel',
    resource: 'order',
    action: 'cancel',
    riskBaseline: BUSINESS_WRITE_RISK,
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
