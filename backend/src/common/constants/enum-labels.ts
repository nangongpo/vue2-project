import { RoleType, StandardDataScopeType } from '#app/common/types/prisma-enums.js'

/** 接口响应中的静态枚举中文名称统一从这里读取。 */
export const ROLE_TYPE_LABELS: Record<RoleType, string> = {
  BUSINESS: '业务角色',
  SYSTEM: '系统管理',
  SECURITY: '安全管理',
  AUDIT: '审计管理',
}

/** 通用启停状态映射；仅适用于 ACTIVE / DISABLED。 */
export const ENABLEMENT_STATUS_LABELS: Record<'ACTIVE' | 'DISABLED', string> = {
  ACTIVE: '启用',
  DISABLED: '停用',
}

export const USER_STATUS_LABELS: Record<'ACTIVE' | 'DISABLED' | 'LOCKED', string> = {
  ...ENABLEMENT_STATUS_LABELS,
  LOCKED: '锁定',
}

export const DATA_SCOPE_TYPE_LABELS: Record<StandardDataScopeType, string> = {
  SELF: '本人',
  DEPARTMENT_SELF: '本部门',
  DEPARTMENT_TREE: '本部门及下级部门',
  ORGANIZATION_SELF: '本组织',
  ORGANIZATION_TREE: '本组织及下级组织',
  TENANT: '本租户',
}

export const APPROVAL_KIND_LABELS: Record<string, string> = {
  ROLE_GRANT: '高危角色授予',
  ROLE_STATUS: '高危角色停用',
  ROLE_PERMISSIONS: '高危权限授予',
  API_ROUTE_CHANGE: '接口路由变更',
  API_CREATE: '新增接口',
  API_UPDATE: '编辑接口',
  API_ENABLE: '启用接口',
  API_DISABLE: '停用接口',
  API_DELETE: '删除接口',
  PAGE_ENABLE: '启用系统页面',
  PAGE_DISABLE: '停用系统页面',
  PAGE_ROUTE_CHANGE: '页面路由变更',
  ELEVATED_SCOPE: '受控数据范围',
  ROLE_REVOKE: '高危角色回收',
  ROLE_PERMISSION_REVOKE: '高危权限回收',
  ELEVATED_REVOKE: '受控数据范围撤销',
  MFA_RESET: '管理员 MFA 重置',
  FILE_DELETE: '文件删除',
  FILE_REJECT: '文件拒绝',
  FILE_RESTORE: '文件恢复',
  FILE_RESCAN: '文件重新扫描',
}

export const APPROVAL_STATUS_LABELS: Record<string, string> = {
  REQUESTED: '待审批',
  APPROVED: '待执行',
  EXECUTED: '待复核',
  REVIEWED: '已复核',
  CANCELLED: '已撤回',
}

/** 审批流程状态与期限状态分离；期限状态不替代流程状态。 */
export const APPROVAL_DEADLINE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: '有效期内',
  EXPIRED: '已过期',
  COMPLETED_ON_TIME: '按期完成',
  COMPLETED_AFTER_DEADLINE: '超期完成',
  CANCELLED: '已撤回',
}

export const OPS_TICKET_STATUS_LABELS: Record<string, string> = {
  DRAFT: '草稿',
  SUBMITTED: '待确认',
  APPROVED: '待执行',
  EXECUTED: '待复核',
  REVIEWED: '已归档',
  REJECTED: '已拒绝',
  CANCELLED: '已取消',
}

export const OPS_TICKET_TYPE_LABELS: Record<string, string> = {
  MFA_RESET_EMERGENCY: 'MFA 应急重置',
  DB_MANUAL_FIX: '数据库手工修复',
  PERMISSION_RECOVERY: '权限恢复',
  ACCOUNT_RECOVERY: '账户恢复',
  OTHER: '其他',
}

export const OPS_TICKET_RISK_LABELS: Record<string, string> = {
  LOW: '低风险',
  MEDIUM: '中风险',
  HIGH: '高风险',
  CRITICAL: '严重风险',
}

export const OPS_TICKET_RISK_TONES: Record<string, 'success' | 'warning' | 'danger' | 'info'> = {
  LOW: 'success',
  MEDIUM: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
}

export const OPS_TICKET_TARGET_TYPE_LABELS: Record<string, string> = {
  USER: '用户',
  ROLE: '角色',
  PERMISSION: '权限',
  DATABASE: '数据库',
  SYSTEM: '系统',
  OTHER: '其他',
}

export const OPS_TICKET_EVIDENCE_TYPE_LABELS: Record<string, string> = {
  APPROVAL_SCREENSHOT: '审批截图',
  EMAIL: '邮件',
  CHAT: '聊天记录',
  SQL_REVIEW: 'SQL 复核记录',
  OTHER: '其他',
}

export const OPS_TICKET_EXECUTION_RESULT_LABELS: Record<string, string> = {
  SUCCESS: '成功',
  FAILED: '失败',
}

export const FILE_STATUS_LABELS: Record<string, string> = {
  QUARANTINED: '隔离',
  READY: '可用',
  REJECTED: '拒绝',
  DELETED: '已删除',
}

export const FILE_SCAN_STATUS_LABELS: Record<string, string> = {
  PENDING: '待扫描',
  CLEAN: '通过',
  INFECTED: '感染/违规',
  ERROR: '扫描异常',
}

export const HEALTH_STATUS_LABELS: Record<string, string> = {
  ok: '正常',
  degraded: '部分降级',
  unavailable: '不可用',
  unknown: '未知',
}

export const HEALTH_STATUS_TONES: Record<string, string> = {
  ok: 'success',
  degraded: 'warning',
  unavailable: 'danger',
  unknown: 'info',
}
