import type { RiskLevel } from '#app/security/policies/risk-policy.js'

export type FieldStatus = 'ACTIVE' | 'DISABLED'

export type DataFieldDefinition = {
  resource: string
  field: string
  name: string
  dataType: string
  relationResource?: string
  relationModel?: string
  relationField?: string
  riskLevel: RiskLevel
  writable?: boolean
  status?: FieldStatus
}

export type DataFieldOverride = Partial<
  Pick<
    DataFieldDefinition,
    | 'name'
    | 'dataType'
    | 'riskLevel'
    | 'writable'
    | 'relationResource'
    | 'relationModel'
    | 'relationField'
  >
> & { status?: FieldStatus }

export type ButtonFieldPolicy = {
  field: string
  readCode: string
  writeCode: string
  riskLevel: RiskLevel
  label: string
}

export type DmmfField = {
  name: string
  type: string
  kind: string
  isList: boolean
}
