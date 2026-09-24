import { createHmac, timingSafeEqual } from 'node:crypto'
export type RequestParameters = Record<string, unknown>
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
const value = (input: unknown) =>
  Array.isArray(input) || (input !== null && typeof input === 'object') ? JSON.stringify(input) : String(input)
export function canonicalize(body: RequestParameters) {
  return Object.keys(body)
    .filter((k) => k !== 'Signature' && body[k] !== undefined && body[k] !== null)
    .sort()
    .map((k) => `${encode(k)}=${encode(value(body[k]))}`)
    .join('&')
}
export function signRequest(method: string, body: RequestParameters, secret: string) {
  const canonical = canonicalize(body)
  return createHmac('sha256', `${secret}&`)
    .update(`${method.toUpperCase()}&%2F&${encode(canonical)}`)
    .digest('base64')
}
export function signaturesMatch(actual: string, expected: string) {
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b)
}
export function requiredVersion(body: RequestParameters) {
  if (!body.ApiVersion || !body.ProtocolVersion) return 'VERSION_REQUIRED'
  if (String(body.ApiVersion) !== '1' || String(body.ProtocolVersion) !== '1.0') return 'VERSION_UNSUPPORTED'
  return undefined
}
