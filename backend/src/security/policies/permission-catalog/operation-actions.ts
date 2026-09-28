export type OperationActionCategory = '查询' | '写入' | '状态' | '删除' | '绑定' | '授权' | '流程' | '输出' | '校验'

export type OperationActionOption = {
  value: string
  label: string
  category: OperationActionCategory
  description: string
}

/** 服务端维护的标准操作标识目录，前端通过 options 接口读取，不在数据库中维护。 */
export const OPERATION_ACTION_OPTIONS: readonly OperationActionOption[] = Object.freeze([
  { value: 'read', label: '查询', category: '查询', description: '列表或普通读取' },
  { value: 'detail', label: '详情', category: '查询', description: '单条详情' },
  { value: 'options', label: '选项', category: '查询', description: '下拉选项或选择器数据' },
  { value: 'create', label: '创建', category: '写入', description: '创建' },
  { value: 'update', label: '修改', category: '写入', description: '修改' },
  { value: 'enable', label: '启用', category: '状态', description: '启用' },
  { value: 'disable', label: '停用', category: '状态', description: '停用' },
  { value: 'unlock', label: '解锁', category: '状态', description: '解除锁定' },
  { value: 'delete', label: '删除', category: '删除', description: '删除，必须经过引用保护' },
  { value: 'bind', label: '绑定', category: '绑定', description: '建立明确绑定关系' },
  { value: 'grant', label: '授予', category: '授权', description: '授予权限或范围' },
  { value: 'revoke', label: '撤销', category: '授权', description: '撤销权限或范围' },
  { value: 'submit', label: '提交', category: '流程', description: '提交' },
  { value: 'approve', label: '审批', category: '流程', description: '审批' },
  { value: 'execute', label: '执行', category: '流程', description: '执行' },
  { value: 'review', label: '复核', category: '流程', description: '复核' },
  { value: 'cancel', label: '取消', category: '流程', description: '取消' },
  { value: 'export', label: '导出', category: '输出', description: '导出' },
  { value: 'verify', label: '校验', category: '校验', description: '完整性或安全校验' },
])
