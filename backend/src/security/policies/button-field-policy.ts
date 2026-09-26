import { ForbiddenException } from '@nestjs/common'
import { maxRiskLevel, type RiskLevel } from './risk-policy.js'

export type FieldPolicy = {
  field: string
  readCode: string
  writeCode: string
  riskLevel: RiskLevel
  label: string
}

export const BUTTON_FIELD_POLICIES: readonly FieldPolicy[] = [
  {
    field: 'label',
    readCode: 'system.button.field.label.read',
    writeCode: 'system.button.field.label.write',
    riskLevel: 'L1',
    label: '显示文本',
  },
  {
    field: 'sort',
    readCode: 'system.button.field.sort.read',
    writeCode: 'system.button.field.sort.write',
    riskLevel: 'L1',
    label: '排序',
  },
  {
    field: 'name',
    readCode: 'system.button.field.name.read',
    writeCode: 'system.button.field.name.write',
    riskLevel: 'L3',
    label: '按钮名称',
  },
  {
    field: 'code',
    readCode: 'system.button.field.code.read',
    writeCode: 'system.button.field.code.write',
    riskLevel: 'L3',
    label: '权限码',
  },
  {
    field: 'status',
    readCode: 'system.button.field.status.read',
    writeCode: 'system.button.field.status.write',
    riskLevel: 'L3',
    label: '状态',
  },
  {
    field: 'apis',
    readCode: 'system.button.field.apis.read',
    writeCode: 'system.button.field.apis.write',
    riskLevel: 'L3',
    label: '操作接口',
  },
]

export const BUTTON_FIELD_PERMISSIONS = BUTTON_FIELD_POLICIES.flatMap((policy) => [
  { code: policy.readCode, name: `${policy.label}查看`, action: `field.${policy.field}.read` },
  { code: policy.writeCode, name: `${policy.label}修改`, action: `field.${policy.field}.write` },
])

function hasPermission(permissionCodes: readonly string[], code: string) {
  return permissionCodes.includes('*') || permissionCodes.includes(code)
}

export function hasAnyButtonFieldPermission(permissionCodes: readonly string[]) {
  return BUTTON_FIELD_POLICIES.some(
    (policy) =>
      hasPermission(permissionCodes, policy.readCode) ||
      hasPermission(permissionCodes, policy.writeCode)
  )
}

export function buttonReadableFields(permissionCodes: readonly string[]) {
  return new Set(
    BUTTON_FIELD_POLICIES.filter((policy) => hasPermission(permissionCodes, policy.readCode)).map(
      (policy) => policy.field
    )
  )
}

export function buttonWritableFields(permissionCodes: readonly string[]) {
  return new Set(
    BUTTON_FIELD_POLICIES.filter((policy) => hasPermission(permissionCodes, policy.writeCode)).map(
      (policy) => policy.field
    )
  )
}

export function buttonFieldRisk(fields: readonly string[]): RiskLevel {
  return maxRiskLevel(
    ...fields.map(
      (field) => BUTTON_FIELD_POLICIES.find((policy) => policy.field === field)?.riskLevel || 'L3'
    )
  )
}

export function assertButtonWritableFields(
  input: Record<string, unknown>,
  permissionCodes: readonly string[]
) {
  const writable = buttonWritableFields(permissionCodes)
  const allowedInput = new Set(BUTTON_FIELD_POLICIES.map((policy) => policy.field))
  const fields = Object.keys(input)
  const unknown = fields.filter((field) => !allowedInput.has(field))
  if (unknown.length) throw new ForbiddenException(`按钮字段不允许修改：${unknown.join('、')}`)
  const denied = fields.filter((field) => !writable.has(field))
  if (denied.length) throw new ForbiddenException(`没有按钮字段修改权限：${denied.join('、')}`)
  return { fields, riskLevel: buttonFieldRisk(fields) }
}

export function projectButton<T extends Record<string, unknown>>(
  button: T,
  permissionCodes: readonly string[]
) {
  const readable = buttonReadableFields(permissionCodes)
  const projected: Record<string, unknown> = { id: button.id, functionId: button.functionId }
  for (const field of readable) {
    if (Object.prototype.hasOwnProperty.call(button, field)) projected[field] = button[field]
  }
  projected.fieldCapabilities = Object.fromEntries(
    BUTTON_FIELD_POLICIES.map((policy) => [
      policy.field,
      {
        read: readable.has(policy.field),
        write: buttonWritableFields(permissionCodes).has(policy.field),
        riskLevel: policy.riskLevel,
      },
    ])
  )
  return projected as T
}

export function projectButtons<T extends Record<string, unknown>[]>(
  buttons: T,
  permissionCodes: readonly string[]
) {
  return buttons.map((button) => projectButton(button, permissionCodes)) as T
}
