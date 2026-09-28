import type { ApiDefinition } from '#app/security/policies/permission-catalog/types.js'

/** Seeded page and directory codes. Every code must have an explicit binding entry. */
export type SeedPageCode =
  | 'system'
  | 'business'
  | 'page.system.user'
  | 'page.system.role'
  | 'page.system.permission'
  | 'page.system.api'
  | 'page.system.approval'
  | 'page.system.audit'
  | 'page.system.health'
  | 'page.system.ops-tickets'
  | 'page.business.order-manage'

export type PagePermissionBinding =
  | { type: 'PAGE_API'; apiCode: ApiDefinition['code'] }
  | { type: 'BUTTON_API'; apiCode: ApiDefinition['code']; actionKey: string }

const pageApi = (apiCode: ApiDefinition['code']): PagePermissionBinding => ({
  type: 'PAGE_API',
  apiCode,
})

const buttonApi = (apiCode: ApiDefinition['code'], actionKey: string): PagePermissionBinding => ({
  type: 'BUTTON_API',
  apiCode,
  actionKey,
})

/**
 * The binding boundary is code-owned and exhaustive.
 *
 * PAGE_API is only for read-only page initialization. Every mutation, export,
 * approval, or integrity operation must be an explicit BUTTON_API binding.
 */
export const PAGE_PERMISSION_BINDINGS: Readonly<Record<SeedPageCode, readonly PagePermissionBinding[]>> = {
  system: [],
  business: [],
  'page.system.user': [
    pageApi('system.user.read'),
    buttonApi('system.user.create', 'create'),
    buttonApi('system.user.update', 'update'),
    buttonApi('system.user.enable', 'enable'),
    buttonApi('system.user.disable', 'disable'),
    buttonApi('system.user.reset-password', 'reset-password'),
    buttonApi('system.user.unlock', 'unlock'),
    buttonApi('system.user.grant', 'grant'),
  ],
  'page.system.role': [
    pageApi('system.role.read'),
    pageApi('system.role.options'),
    pageApi('system.role.assignment-options'),
    pageApi('system.role.grants.read'),
    pageApi('system.data-scope.read'),
    buttonApi('system.role.create', 'create'),
    buttonApi('system.role.update', 'update'),
    buttonApi('system.role.enable', 'enable'),
    buttonApi('system.role.disable', 'disable'),
    buttonApi('system.role.grant', 'grant'),
    buttonApi('system.role.delete', 'delete'),
    buttonApi('system.data-scope.update', 'update'),
    buttonApi('system.data-scope.revoke', 'revoke'),
  ],
  'page.system.permission': [
    pageApi('system.page.read'),
    pageApi('system.button.read'),
    pageApi('system.button.options'),
    pageApi('system.page.api.read'),
    pageApi('system.page.api.options'),
    pageApi('system.field.read'),
    pageApi('system.data-resource.read'),
    buttonApi('system.directory.create', 'create'),
    buttonApi('system.directory.update', 'update'),
    buttonApi('system.directory.delete', 'delete'),
    buttonApi('system.page.create', 'create'),
    buttonApi('system.page.update', 'update'),
    buttonApi('system.page.enable', 'enable'),
    buttonApi('system.page.disable', 'disable'),
    buttonApi('system.page.api.bind', 'bind'),
    buttonApi('system.page.delete', 'delete'),
    buttonApi('system.button.create', 'create'),
    buttonApi('system.button.update', 'update'),
    buttonApi('system.button.enable', 'enable'),
    buttonApi('system.button.disable', 'disable'),
    buttonApi('system.button.api.bind', 'bind'),
    buttonApi('system.field.create', 'create'),
    buttonApi('system.field.update', 'update'),
    buttonApi('system.field.enable', 'enable'),
    buttonApi('system.field.disable', 'disable'),
    buttonApi('system.data-resource.create', 'create'),
    buttonApi('system.data-resource.update', 'update'),
    buttonApi('system.data-resource.enable', 'enable'),
    buttonApi('system.data-resource.disable', 'disable'),
  ],
  'page.system.api': [
    pageApi('system.api.read'),
    pageApi('system.api.options'),
    pageApi('system.api.references'),
    buttonApi('system.api.create', 'create'),
    buttonApi('system.api.update', 'update'),
    buttonApi('system.api.enable', 'enable'),
    buttonApi('system.api.disable', 'disable'),
    buttonApi('system.api.delete', 'delete'),
  ],
  'page.system.approval': [
    pageApi('system.approval.read'),
    pageApi('system.approval.detail'),
    pageApi('system.approval.target-options'),
    buttonApi('system.approval.create', 'create'),
    buttonApi('system.approval.approve', 'approve'),
    buttonApi('system.approval.execute', 'execute'),
    buttonApi('system.approval.cancel', 'cancel'),
    buttonApi('system.approval.review', 'review'),
  ],
  'page.system.audit': [
    pageApi('system.audit.read'),
    pageApi('system.audit.detail'),
    buttonApi('system.audit.integrity', 'integrity'),
    buttonApi('system.audit.export', 'export'),
  ],
  'page.system.health': [pageApi('system.health.read')],
  'page.system.ops-tickets': [
    pageApi('system.ops-ticket.read'),
    pageApi('system.ops-ticket.detail'),
    buttonApi('system.ops-ticket.create', 'create'),
    buttonApi('system.ops-ticket.update', 'update'),
    buttonApi('system.ops-ticket.submit', 'submit'),
    buttonApi('system.ops-ticket.approve', 'approve'),
    buttonApi('system.ops-ticket.execute', 'execute'),
    buttonApi('system.ops-ticket.review', 'review'),
    buttonApi('system.ops-ticket.cancel', 'cancel'),
    buttonApi('system.ops-ticket.evidence.create', 'create'),
    buttonApi('system.ops-ticket.execution.create', 'create'),
  ],
  'page.business.order-manage': [pageApi('order.read')],
}
