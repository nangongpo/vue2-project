import { OrderStatus, RoleType, StandardDataScopeType } from '#app/common/types/prisma-enums.js'

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

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: '草稿',
  CONFIRMED: '已确认',
  CANCELLED: '已取消',
  COMPLETED: '已完成',
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
}
