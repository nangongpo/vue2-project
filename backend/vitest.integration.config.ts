import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '#app': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    include: ['integration-tests/**/*.test.ts'],
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
})
