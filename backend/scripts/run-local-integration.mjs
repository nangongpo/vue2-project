import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const backendDirectory = resolve(scriptDirectory, '..')
const envFile = resolve(backendDirectory, '.env')

for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/u)) {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('#')) continue
  const separator = trimmed.indexOf('=')
  if (separator <= 0) continue
  const name = trimmed.slice(0, separator).trim()
  const value = trimmed.slice(separator + 1).trim()
  if (!(name in process.env)) process.env[name] = value
}

process.env.RUN_LOCAL_INTEGRATION = 'true'
const vitest = resolve(backendDirectory, 'node_modules/.bin/vitest')
const child = spawn(vitest, ['run', '--config', 'vitest.integration.config.ts', ...process.argv.slice(2)], {
  cwd: backendDirectory,
  env: process.env,
  stdio: 'inherit',
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
