/**
 * Permission resources that are exposed by each administrative page.
 *
 * API grants are only effective when they are bound to a page or button, so
 * these resource names must stay aligned with permission-catalog.ts.
 */
export const PAGE_PERMISSION_DOMAINS: Record<string, string[]> = {
  system: [],
  'page.system.user': ['system.user'],
  'page.system.role': ['system.role', 'system.data-scope'],
  'page.system.permission': [
    'system.directory',
    'system.page',
    'system.page.api',
    'system.button',
    'system.button.api',
    'system.field',
    'system.data-resource',
  ],
  'page.system.api': ['system.api'],
  'page.system.approval': ['system.approval'],
  'page.system.audit': ['system.audit'],
  'page.system.health': ['system.health'],
  'page.system.ops-tickets': [
    'system.ops-ticket',
    'system.ops-ticket.evidence',
    'system.ops-ticket.execution',
  ],
}

/**
 * Business pages bind only their read API as the page's basic API.
 * Mutating APIs must be granted through explicit buttons or an approval flow.
 */
export const PAGE_PERMISSION_API_CODES: Record<string, string[]> = {
  'page.business.order-manage': ['order.read'],
}
