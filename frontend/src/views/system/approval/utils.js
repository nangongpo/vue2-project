const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const route = /^\/api\/v1\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*\/?$/
const code = /^[a-z][a-z0-9_.:-]{1,127}$/
const resource = /^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/

function id(value) {
  if (!uuid.test(value || '')) throw new Error('请输入有效的 ID')
  return value
}

function targetRef(value, label) {
  if (!value || typeof value !== 'string' || value.length > 512) throw new Error(`请选择${label}`)
  return value
}

function buildPermissionPayload(form) {
  const permissionIds = (Array.isArray(form.permissionIds)
    ? form.permissionIds
    : String(form.permissionIds || '').trim().split(/[\s,，]+/).filter(Boolean)
  ).map(id)
  if (!permissionIds.length || permissionIds.length > 200 || new Set(permissionIds).size !== permissionIds.length)
    throw new Error('权限 ID 需为 1–200 个且不能重复')
  return form.roleRef
    ? { roleRef: targetRef(form.roleRef, '角色'), permissionIds }
    : { roleId: id(form.roleId), permissionIds }
}

function buildScopePayload(form, metadata) {
  if (!(metadata.scopeTypeOptions || []).some((item) => item.value === form.scopeType) || !resource.test(form.resource))
    throw new Error('请填写有效的资源和范围')
  const targets = form.scopeType === 'ALL' ? [] : (form.targets || []).map((target) => {
    if (!(metadata.targetTypeOptions || []).some((item) => item.value === target.targetType)) throw new Error('目标类型无效，请重新选择')
    return { targetType: target.targetType, targetId: id(target.targetId) }
  })
  if (form.scopeType === 'CUSTOM' && (!targets.length || targets.length > 200 || new Set(targets.map((target) => target.targetType + ':' + target.targetId)).size !== targets.length))
    throw new Error('请添加 1–200 个不重复的目标')
  return { ...(form.roleRef ? { roleRef: targetRef(form.roleRef, '角色') } : { roleId: id(form.roleId) }), resource: form.resource, scopeType: form.scopeType, targets }
}

const payloadBuilders = {
  ROLE_GRANT: (form) => form.userRef && form.roleRef
    ? { userRef: targetRef(form.userRef, '用户'), roleRef: targetRef(form.roleRef, '角色') }
    : { userId: id(form.userId), roleId: id(form.roleId) },
  ROLE_REVOKE: (form) => form.userRef && form.roleRef
    ? { userRef: targetRef(form.userRef, '用户'), roleRef: targetRef(form.roleRef, '角色') }
    : { userId: id(form.userId), roleId: id(form.roleId) },
  MFA_RESET: (form) => form.userRef ? { userRef: targetRef(form.userRef, '用户') } : { userId: id(form.userId) },
  ROLE_STATUS: (form) => ({ roleRef: targetRef(form.roleRef, '角色'), status: form.status }),
  ROLE_PERMISSIONS: buildPermissionPayload,
  ROLE_PERMISSION_REVOKE: buildPermissionPayload,
  ELEVATED_REVOKE: (form) => ({ scopeId: id(form.scopeId) }),
  API_ROUTE_CHANGE: (form, metadata) => {
    if (!code.test(form.code) || !(metadata.httpMethodOptions || []).includes(form.method) || !route.test(form.path))
      throw new Error('请填写权限码、HTTP 方法和有效路由')
    return { apiId: id(form.apiId), code: form.code, method: form.method, path: form.path }
  },
  ELEVATED_SCOPE: buildScopePayload,
}

export function buildApprovalPayload(form, metadata = {}) {
  const builder = payloadBuilders[form.kind]
  if (!builder) throw new Error('暂不支持该申请类型')
  return builder(form, metadata)
}

export function approvalBody(form, metadata = {}, now = Date.now()) {
  const expires = new Date(form.expiresAt)
  const kindMeta = metadata.kindMeta || metadata
  const maxHours = Number(kindMeta.maxHours)
  if (!form.expiresAt || !Number.isFinite(+expires) || +expires <= now || (Number.isFinite(maxHours) && +expires > now + maxHours * 3600000))
    throw new Error(Number.isFinite(maxHours) ? `到期时间须在未来 ${maxHours} 小时内` : '请输入有效的到期时间')
  const reason = String(form.reason || '').trim()
  if (!reason || reason.length > 255) throw new Error('请填写申请原因，最多 255 字')
  const payload = form.payload || buildApprovalPayload(form, metadata)
  if (typeof payload !== 'object' || Array.isArray(payload)) throw new Error('申请表单尚未完成')
  return { kind: form.kind, reason, expiresAt: expires.toISOString(), payload }
}
