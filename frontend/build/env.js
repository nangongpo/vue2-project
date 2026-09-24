import fs from 'node:fs'
import path from 'node:path'
import { loadEnv } from 'vite'

export function isEnabled(value) {
  return String(value).toLowerCase() === 'true'
}

export function createBuildContext(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  const isDevelopment = mode === 'development'
  const securityHttps = isDevelopment && isEnabled(env.VITE_ENABLE_HTTPS)
  const securityCsp = isEnabled(env.VITE_ENABLE_CSP)
  const port = Number(env.VITE_PORT || 5173)
  let httpsOptions = false

  if (securityHttps) {
    const keyFile = path.resolve(
      process.cwd(),
      env.VITE_HTTPS_KEY_FILE || 'certs/localhost-key.pem'
    )
    const certFile = path.resolve(process.cwd(), env.VITE_HTTPS_CERT_FILE || 'certs/localhost.pem')
    if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
      throw new Error(`VITE_ENABLE_HTTPS=true 时必须提供证书文件：${keyFile} 和 ${certFile}`)
    }
    httpsOptions = { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }
  }

  return {
    env,
    mode,
    isDevelopment,
    securityHttps,
    securityCsp,
    port,
    httpsOptions,
  }
}
