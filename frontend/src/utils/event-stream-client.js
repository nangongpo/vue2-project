const DEFAULT_RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000]

function apiUrl(path) {
  const configuredBase = String(import.meta.env.VITE_APP_BASE_API || '/api/v1')
  const base = configuredBase.endsWith('/') ? configuredBase.slice(0, -1) : configuredBase
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const target = new URL(`${base}${normalizedPath}`, window.location.origin)
  if (target.origin !== window.location.origin) throw new Error('事件流必须使用同源地址')
  return target.toString()
}

function parseEvent(event) {
  try {
    return JSON.parse(event.data)
  } catch {
    return event.data
  }
}

/**
 * 可复用 SSE 接收端：统一凭据、事件解析、重连退避和资源释放。
 * 当前客户端只允许同源地址；跨域事件流必须经过同源网关代理，不在浏览器端直接携带会话 Cookie。
 * 业务模块只需要提供资源路径和事件处理器，不得自行拼接租户或订阅主题。
 */
export class EventStreamClient {
  constructor({ path, events = {}, onOpen, onError, onUnavailable, onParseError, reconnectDelays = DEFAULT_RECONNECT_DELAYS } = {}) {
    this.path = path
    this.events = events
    this.onOpen = onOpen
    this.onError = onError
    this.onUnavailable = onUnavailable
    this.onParseError = onParseError
    this.reconnectDelays = reconnectDelays
    this.source = null
    this.closed = true
    this.reconnectTimer = null
    this.reconnectAttempt = 0
  }

  connect() {
    if (typeof window === 'undefined' || typeof window.EventSource !== 'function') {
      if (this.onUnavailable) this.onUnavailable()
      return null
    }
    this.closed = false
    this.reconnectAttempt = 0
    try {
      this.openSource()
    } catch (error) {
      this.closed = true
      if (this.onError) this.onError(error)
      return null
    }
    return this
  }

  close() {
    this.closed = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    if (this.source) this.source.close()
    this.source = null
  }

  openSource() {
    if (this.closed) return
    this.source = new window.EventSource(apiUrl(this.path), { withCredentials: true })
    this.source.onopen = (event) => {
      this.reconnectAttempt = 0
      if (this.onOpen) this.onOpen(event)
    }
    for (const [eventName, handler] of Object.entries(this.events)) {
      this.source.addEventListener(eventName, (event) => {
        try {
          handler(parseEvent(event), event)
        } catch (error) {
          if (this.onParseError) this.onParseError(error, event)
        }
      })
    }
    this.source.onerror = (event) => this.handleError(event)
  }

  handleError(event) {
    if (this.closed) return
    if (this.source) this.source.close()
    this.source = null
    const delay = this.reconnectDelays[this.reconnectAttempt]
    if (delay === undefined) {
      if (this.onError) this.onError(event)
      return
    }
    this.reconnectAttempt += 1
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.openSource()
    }, delay)
  }
}

