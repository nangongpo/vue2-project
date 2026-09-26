import type { DataFieldOverride } from './data-field-generator.js'

/**
 * 自动生成字段的人工覆盖项。
 *
 * 普通字段不需要配置；只有中文名称、风险等级或可写性与默认规则不同时才添加。
 */
export const DATA_FIELD_OVERRIDES: Record<string, DataFieldOverride> = {
  'system.user.roles': {
    relationResource: 'system.role',
    relationModel: 'Role',
    relationField: 'role',
  },
  // 'system.department.code': { name: '部门编码', riskLevel: 'L2', writable: true },
  // 'system.department.name': { name: '部门名称', writable: true },
  // 'system.department.status': { name: '部门状态', riskLevel: 'L3' },
}

/** Prisma 模型到权限资源的映射。未配置的模型使用 system + kebab-case 兜底。 */
export const MODEL_RESOURCE_MAP: Record<string, string> = {
  User: 'system.user',
  Role: 'system.role',
  Permission: 'system.permission',
  FunctionButton: 'system.button',
  SystemFunction: 'system.page',
  AuditLog: 'system.audit',
  ApprovalRequest: 'system.approval',
  OpsTicket: 'system.ops-ticket',
  Tenant: 'system.tenant',
  Organization: 'system.organization',
  Department: 'system.department',
}
