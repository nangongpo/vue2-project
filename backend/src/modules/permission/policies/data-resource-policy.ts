const RESOURCE_CODE_PATTERN = /^[a-z][a-z0-9_.:-]{0,127}$/

/** Data-scope resources are business objects, never management namespaces. */
export function isBusinessDataResource(code: string) {
  return RESOURCE_CODE_PATTERN.test(code) && !code.startsWith('system.') && !code.startsWith('page.')
}
