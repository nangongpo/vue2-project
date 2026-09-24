import path from 'node:path'
import { createBuildContext } from './env.js'
import { createPlugins, createServerHeaders } from './plugins.js'
import { createRolldownOptions } from './rolldown.js'

export function createViteConfig(mode) {
  const context = createBuildContext(mode)
  const { env, httpsOptions, port, securityCsp } = context
  const globalScss = path
    .join(import.meta.dirname, '..', 'src/styles/variables.scss')
    .replaceAll('\\', '/')

  return {
    define: {
      __BUILD_VERSION__: Date.now(),
    },
    base: env.VITE_BASE_URL,
    plugins: createPlugins(context),
    oxc: {
      compress: {
        dropConsole: true,
        dropDebugger: true,
        treeshake: { manualPureFunctions: ['console.log'] },
        mangle: true,
      },
    },
    optimizeDeps: { exclude: ['element-ui'] },
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "${globalScss}" as *;`,
        },
      },
    },
    server: {
      https: httpsOptions,
      port,
      host: '0.0.0.0',
      open: true,
      cors: true,
      proxy:
        env.VITE_MOCK === 'false'
          ? {
              [env.VITE_APP_BASE_API]: {
                target: env.VITE_APP_PROXY_URL,
                changeOrigin: true,
              },
            }
          : undefined,
      headers: createServerHeaders(securityCsp),
    },
    resolve: {
      mainFields: ['browser', 'module', 'main'],
      alias: [{ find: '@', replacement: path.join(import.meta.dirname, '..', 'src') }],
    },
    build: {
      outDir: env.VITE_OUTDIR,
      assetsDir: env.VITE_ASSETS_DIR,
      sourcemap: true,
      cssCodeSplit: true,
      assetsInlineLimit: 40960,
      chunkSizeWarningLimit: 1000,
      reportCompressedSize: false,
      rolldownOptions: createRolldownOptions(env),
    },
  }
}
