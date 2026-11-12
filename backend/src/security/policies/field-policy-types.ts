import type { RiskLevel } from '#app/security/policies/risk-policy.js'

export type FieldStatus = 'ACTIVE' | 'DISABLED'
export type FieldWriteOperation = 'CREATE' | 'UPDATE'

export type DataFieldDefinition = {
  resource: string
  field: string
  name: string
  dataType: string
  relationResource?: string
  relationModel?: string
  relationField?: string
  riskLevel: RiskLevel
  /** 是否允许字段出现在响应中；未声明时默认允许读取。 */
  readable?: boolean
  /** 字段允许写入的请求操作；未声明表示不可写。 */
  writeOperations?: readonly FieldWriteOperation[]
  status?: FieldStatus
}

export type DataFieldOverride = Partial<
  Pick<
    DataFieldDefinition,
    | 'name'
    | 'dataType'
    | 'riskLevel'
    | 'readable'
    | 'writeOperations'
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
