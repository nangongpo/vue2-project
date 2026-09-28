export type ApiDisplayLabel = {
  name: string
  buttonLabel?: string
}

/**
 * Single source of truth for API permission names and management-button labels.
 * `name` describes the API; `buttonLabel` is present only for management buttons.
 */
export const API_DISPLAY_LABELS: Readonly<Record<string, ApiDisplayLabel>> = {
  'system.directory.create': { name: '新增页面目录', buttonLabel: '新增目录' },
  'system.directory.update': { name: '编辑页面目录', buttonLabel: '编辑目录' },
  'system.directory.delete': { name: '删除页面目录', buttonLabel: '删除目录' },
  'system.page.read': { name: '查询页面权限' },
  'system.page.create': { name: '新增页面', buttonLabel: '新增页面' },
  'system.page.update': { name: '编辑页面', buttonLabel: '编辑页面' },
  'system.page.enable': { name: '启用页面', buttonLabel: '启用页面' },
  'system.page.disable': { name: '停用页面', buttonLabel: '停用页面' },
  'system.page.api.bind': { name: '配置页面接口', buttonLabel: '配置页面接口' },
  'system.page.api.read': { name: '查询页面基础接口' },
  'system.page.api.options': { name: '查询页面接口选项' },
  'system.page.delete': { name: '删除页面', buttonLabel: '删除页面' },
  'system.button.read': { name: '查询页面按钮' },
  'system.button.create': { name: '新增按钮', buttonLabel: '新增按钮' },
  'system.button.update': { name: '编辑按钮', buttonLabel: '编辑按钮' },
  'system.button.enable': { name: '启用按钮', buttonLabel: '启用按钮' },
  'system.button.disable': { name: '停用按钮', buttonLabel: '停用按钮' },
  'system.button.options': { name: '查询按钮操作标识选项' },
  'system.button.api.bind': { name: '配置按钮接口', buttonLabel: '绑定操作接口' },
  'system.api.read': { name: '查询接口权限' },
  'system.api.create': { name: '新增接口权限', buttonLabel: '新增接口' },
  'system.api.update': { name: '编辑接口权限', buttonLabel: '编辑接口' },
  'system.api.enable': { name: '启用接口权限', buttonLabel: '启用接口' },
  'system.api.disable': { name: '停用接口权限', buttonLabel: '停用接口' },
  'system.api.options': { name: '查询接口选项' },
  'system.api.references': { name: '查询接口引用' },
  'system.api.delete': { name: '删除接口权限', buttonLabel: '删除接口' },
  'system.user.read': { name: '查询用户' },
  'system.user.create': { name: '新增用户', buttonLabel: '新增用户' },
  'system.user.update': { name: '编辑用户', buttonLabel: '编辑用户' },
  'system.user.enable': { name: '启用用户', buttonLabel: '启用用户' },
  'system.user.disable': { name: '停用用户', buttonLabel: '停用用户' },
  'system.user.reset-password': { name: '重置用户密码', buttonLabel: '重置密码' },
  'system.user.unlock': { name: '解除锁定用户', buttonLabel: '解除锁定' },
  'system.user.grant': { name: '分配用户角色', buttonLabel: '分配角色' },
  'system.role.read': { name: '查询角色' },
  'system.role.create': { name: '新增角色', buttonLabel: '新增角色' },
  'system.role.update': { name: '编辑角色', buttonLabel: '编辑角色' },
  'system.role.enable': { name: '启用角色', buttonLabel: '启用角色' },
  'system.role.disable': { name: '停用角色', buttonLabel: '停用角色' },
  'system.role.options': { name: '查询角色权限选项' },
  'system.role.assignment-options': { name: '查询角色分配选项' },
  'system.role.grants.read': { name: '查询角色权限' },
  'system.role.grant': { name: '配置角色权限', buttonLabel: '配置角色权限' },
  'system.role.delete': { name: '删除角色', buttonLabel: '删除角色' },
  'system.audit.read': { name: '查询审计日志' },
  'system.audit.detail': { name: '查看审计详情' },
  'system.audit.integrity': { name: '校验日志完整性', buttonLabel: '校验日志完整性' },
  'system.audit.export': { name: '导出审计日志', buttonLabel: '导出审计日志' },
  'system.health.read': { name: '查询系统状态' },
  'system.approval.create': { name: '新建授权审批', buttonLabel: '新建审批申请' },
  'system.approval.read': { name: '查询授权审批' },
  'system.approval.detail': { name: '查看授权审批详情' },
  'system.approval.target-options': { name: '查询审批目标选项' },
  'system.approval.approve': { name: '审批通过', buttonLabel: '审批通过' },
  'system.approval.execute': { name: '执行审批', buttonLabel: '执行审批' },
  'system.approval.review': { name: '审计复核审批', buttonLabel: '审计复核' },
  'system.approval.cancel': { name: '撤回审批申请', buttonLabel: '撤回审批申请' },
  'system.data-scope.read': { name: '查询角色数据范围' },
  'system.data-scope.update': { name: '新增角色数据范围', buttonLabel: '调整数据范围' },
  'system.data-scope.revoke': { name: '撤销角色数据范围', buttonLabel: '撤销数据范围' },
  'system.field.read': { name: '查询字段权限' },
  'system.field.create': { name: '新增字段权限', buttonLabel: '新增字段权限' },
  'system.field.update': { name: '编辑字段权限', buttonLabel: '编辑字段权限' },
  'system.field.enable': { name: '启用字段权限', buttonLabel: '启用字段权限' },
  'system.field.disable': { name: '停用字段权限', buttonLabel: '停用字段权限' },
  'system.data-resource.read': { name: '查询数据资源' },
  'system.data-resource.create': { name: '登记数据资源', buttonLabel: '新增数据对象' },
  'system.data-resource.update': { name: '编辑数据资源', buttonLabel: '编辑数据对象' },
  'system.data-resource.enable': { name: '启用数据资源', buttonLabel: '启用数据对象' },
  'system.data-resource.disable': { name: '停用数据资源', buttonLabel: '停用数据对象' },
  'system.operation-policy.read': { name: '查询操作策略' },
  'system.ops-ticket.read': { name: '查询应急工单' },
  'system.ops-ticket.detail': { name: '查看应急工单详情' },
  'system.ops-ticket.create': { name: '新建应急工单', buttonLabel: '新建应急工单' },
  'system.ops-ticket.update': { name: '编辑应急工单', buttonLabel: '编辑应急工单' },
  'system.ops-ticket.submit': { name: '提交工单', buttonLabel: '提交工单' },
  'system.ops-ticket.approve': { name: '审批应急工单', buttonLabel: '审批应急工单' },
  'system.ops-ticket.execute': { name: '执行应急工单', buttonLabel: '执行应急工单' },
  'system.ops-ticket.review': { name: '复核应急工单', buttonLabel: '复核应急工单' },
  'system.ops-ticket.cancel': { name: '取消应急工单', buttonLabel: '取消应急工单' },
  'system.ops-ticket.evidence.create': { name: '补充工单证据', buttonLabel: '补充工单证据' },
  'system.ops-ticket.execution.create': { name: '新增执行记录', buttonLabel: '新增执行记录' },
  'order.read': { name: '查询订单' },
  'order.create': { name: '创建订单' },
  'order.update': { name: '编辑订单' },
  'order.confirm': { name: '确认订单' },
  'order.cancel': { name: '取消订单' },
}

export function apiNameLabel(code: string): string {
  const entry = API_DISPLAY_LABELS[code]
  if (!entry) throw new Error(`API 未配置显示名称：${code}`)
  return entry.name
}

export function apiButtonLabel(code: string): string {
  const label = API_DISPLAY_LABELS[code]?.buttonLabel
  if (!label) throw new Error(`按钮接口未配置显示文案：${code}`)
  return label
}
