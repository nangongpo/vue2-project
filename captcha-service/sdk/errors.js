export class CaptchaSdkError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'CaptchaSdkError'
    this.code = code
    this.details = details
  }
}

export function fail(code, message, details) {
  throw new CaptchaSdkError(code, message, details)
}
