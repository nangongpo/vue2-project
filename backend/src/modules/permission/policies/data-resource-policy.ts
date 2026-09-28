import { BUSINESS_RESOURCE_CODES } from '#app/security/policies/permission-catalog/business-apis.js'

/**
 * Data-scope resources are code-owned business objects.
 *
 * The database may store resource records, but it cannot expand this security
 * boundary. A resource is accepted only when it is explicitly present in the
 * business API catalog.
 */
export function isBusinessDataResource(code: string) {
  return BUSINESS_RESOURCE_CODES.has(code)
}
