import { createHash } from 'node:crypto'
import ViteSvgSpritemap from '@spiriit/vite-plugin-svg-spritemap'
import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue2'
import vue2JsxOxc from 'vite-plugin-vue2-jsx-oxc'
import Components from 'unplugin-vue-components/vite'
import { ElementUIResolver } from './resolvers.js'

function cspHash(value) {
  return `'sha256-${createHash('sha256').update(value).digest('base64')}'`
}

function escapeAttribute(value) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function securityCspPlugin({ enabled, dev, https, port }) {
  return {
    name: 'security-csp',
    enforce: 'post',
    transformIndexHtml(html) {
      if (!enabled) return html

      const inlineScriptHashes = []
      const inlineAttributeHashes = []
      const inlineStyleHashes = []
      html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, body) => {
        if (!/\bsrc\s*=/.test(attrs) && body.trim()) inlineScriptHashes.push(cspHash(body))
        return match
      })
      html.replace(/\sonload\s*=\s*"([^"]*)"/gi, (match, body) => {
        inlineAttributeHashes.push(cspHash(body))
        return match
      })
      html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (match, body) => {
        if (body.trim()) inlineStyleHashes.push(cspHash(body))
        return match
      })

      const connectSources = ["'self'"]
      if (dev) connectSources.push(`${https ? 'wss' : 'ws'}://localhost:${port}`)
      const styleSources = ["'self'"]
      if (dev) styleSources.push("'unsafe-inline'")
      const directives = [
        "default-src 'self'",
        `script-src 'self' ${inlineScriptHashes.join(' ')}`,
        `script-src-attr ${
          inlineAttributeHashes.length
            ? `'unsafe-hashes' ${inlineAttributeHashes.join(' ')}`
            : "'none'"
        }`,
        `style-src ${styleSources.join(' ')} ${inlineStyleHashes.join(' ')}`,
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        `connect-src ${connectSources.join(' ')}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ]
      if (!dev) directives.push('upgrade-insecure-requests')

      const policy = escapeAttribute(directives.join('; '))
      const meta = `<meta http-equiv="Content-Security-Policy" content="${policy}" />`
      return html.replace(/<head>/i, `<head>\n    ${meta}`)
    },
  }
}

function removeCrossoriginPlugin() {
  return {
    name: 'remove-crossorigin',
    enforce: 'post',
    transformIndexHtml(html) {
      let fixedHtml = html
      const polyfillRegex = /<script([^>]*?)id="vite-legacy-polyfill"([^>]*?)><\/script>/g
      fixedHtml = fixedHtml.replace(polyfillRegex, (match) => {
        let cleanTag = match.replace(/\s?crossorigin(=['"]anonymous['"])?/g, '')
        if (!cleanTag.includes('defer')) cleanTag = cleanTag.replace('<script', '<script defer')
        return cleanTag.replace(
          '></script>',
          ' onload="window.__legacyReady=true; if(window.__runViteLegacyEntry) window.__runViteLegacyEntry();"></script>'
        )
      })

      const entryRegex = /<script([^>]*?)id="vite-legacy-entry"([^>]*?)>([\s\S]*?)<\/script>/g
      return fixedHtml.replace(entryRegex, (match, p1, p2, code) => {
        const cleanAttrs = `${p1}${p2}`.replace(/\s?crossorigin(=['"]?.*?['"]?)?/g, '')
        return `<script ${cleanAttrs} id="vite-legacy-entry">
          window.__runViteLegacyEntry = function() {
            ${code.trim()}
          };
          if (window.__legacyReady) {
            window.__runViteLegacyEntry();
          }
        </script>`
      })
    },
  }
}

export function createPlugins(context) {
  const { env, isDevelopment, securityCsp, securityHttps, port } = context
  return [
    vue(),
    vue2JsxOxc(),
    legacy({
      polyfills: true,
      renderLegacyChunks: true,
      renderModernChunks: true,
    }),
    removeCrossoriginPlugin(),
    securityCspPlugin({
      enabled: securityCsp,
      dev: isDevelopment,
      https: securityHttps,
      port,
    }),
    Components({
      dirs: [],
      resolvers: [ElementUIResolver()],
      version: 2.7,
    }),
    ViteSvgSpritemap('./src/icons/svg/*.svg', {
      prefix: 'icon-',
      route: '__spritemap',
      output: {
        filename: `${env.VITE_BASE_URL}[name][extname]`,
        name: 'spritemap',
        view: false,
        use: true,
      },
      svgo: true,
    }),
  ]
}

export function createServerHeaders(enabled) {
  return enabled
    ? {
        // frame-ancestors only works in an HTTP response header, not a meta element.
        'Content-Security-Policy': "frame-ancestors 'none'",
      }
    : undefined
}
