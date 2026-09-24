export const APPROVAL_KINDS = [
  { value: 'ROLE_GRANT', label: '高危角色授予' },
  { value: 'ROLE_PERMISSIONS', label: '高危权限授予' },
  { value: 'API_ROUTE_CHANGE', label: '接口路由变更' },
  { value: 'ELEVATED_SCOPE', label: '受控数据范围' },
  { value: 'ROLE_REVOKE', label: '高危角色回收' },
  { value: 'ROLE_PERMISSION_REVOKE', label: '高危权限回收' },
  { value: 'ELEVATED_REVOKE', label: '受控数据范围撤销' },
  { value: 'MFA_RESET', label: '管理员 MFA 重置' },
]

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function id(value) {
  if (!uuid.test(value || '')) throw new Error('请输入有效的公开 UUID 标识')
  return value
}

export function approvalBody(form, now = Date.now()) {
  const expires = new Date(form.expiresAt)
  if (!form.expiresAt || !Number.isFinite(+expires) || +expires <= now || +expires > now + 86400000)
    throw new Error('申请到期时间必须在未来 24 小时内')
  if (!form.reason?.trim() || form.reason.trim().length > 255)
    throw new Error('请填写申请原因，最多 255 个字符')
  let payload
  switch (form.kind) {
    case 'ROLE_GRANT':
    case 'ROLE_REVOKE':
      payload = { userId: id(form.userId), roleId: id(form.roleId) }
      break
    case 'MFA_RESET':
      payload = { userId: id(form.userId) }
      break
    case 'ROLE_PERMISSIONS':
    case 'ROLE_PERMISSION_REVOKE': {
      const permissionIds = form.permissionIds
        .trim()
        .split(/[\s,，]+/)
        .filter(Boolean)
        .map(id)
      if (
        !permissionIds.length ||
        permissionIds.length > 200 ||
        new Set(permissionIds).size !== permissionIds.length
      )
        throw new Error('权限 UUID 必须为 1–200 个且不能重复')
      payload = { roleId: id(form.roleId), permissionIds }
      break
    }
    case 'ELEVATED_REVOKE':
      payload = { scopeId: id(form.scopeId) }
      break
    case 'API_ROUTE_CHANGE':
      if (
        !/^[a-z][a-z0-9_.:-]{1,127}$/.test(form.code) ||
        !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(form.method) ||
        !/^\/api\/v1\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*\/?$/.test(
          form.path
        )
      )
        throw new Error('请填写明确的权限码、HTTP 方法和 /api/v1/ 路由模板')
      payload = { apiId: id(form.apiId), code: form.code, method: form.method, path: form.path }
      break
    case 'ELEVATED_SCOPE': {
      if (
        !['ALL', 'CUSTOM'].includes(form.scopeType) ||
        !/^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/.test(form.resource)
      )
        throw new Error('请填写有效资源和数据范围')
      const targets =
        form.scopeType === 'ALL'
          ? []
          : form.targets.map((target) => {
              if (!['USER', 'DEPARTMENT', 'ORGANIZATION', 'TENANT'].includes(target.targetType))
                throw new Error('目标类型无效')
              return { targetType: target.targetType, targetId: id(target.targetId) }
            })
      if (
        form.scopeType === 'CUSTOM' &&
        (!targets.length ||
          targets.length > 200 ||
          new Set(targets.map((target) => target.targetType + ':' + target.targetId)).size !==
            targets.length)
      )
        throw new Error('CUSTOM 必须配置 1–200 个不重复的有效目标')
      payload = {
        roleId: id(form.roleId),
        resource: form.resource,
        scopeType: form.scopeType,
        targets,
      }
      break
    }
    default:
      throw new Error('不支持的审批类型')
  }
  return { kind: form.kind, reason: form.reason.trim(), expiresAt: expires.toISOString(), payload }
}

export const STANDARD_SCOPES = [
  { value: 'SELF', label: '本人' },
  { value: 'DEPARTMENT_SELF', label: '本部门' },
  { value: 'DEPARTMENT_TREE', label: '本部门及下属部门' },
  { value: 'ORGANIZATION_SELF', label: '本组织' },
  { value: 'ORGANIZATION_TREE', label: '本组织及下属组织' },
  { value: 'TENANT', label: '当前租户' },
]
