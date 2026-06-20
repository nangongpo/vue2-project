import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import legacy from '@vitejs/plugin-legacy'
import vue from '@vitejs/plugin-vue2'
import vueJsx from 'unplugin-vue-jsx/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementUIResolver } from './resolvers'

function resolve(dir) {
  return path.join(__dirname, dir)
}

export default defineConfig(({ mode }) => {
  // 根据当前工作目录中的 `mode` 加载 .env 文件
  // 设置第三个参数为 '' 来加载所有环境变量，而不管是否有
  // `VITE_` 前缀。
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_URL,
    plugins: [
      vue(),
      vueJsx({
        version: 2
      }),
      legacy({
        polyfills: ['es.promise', 'es.object.assign'],
        renderLegacyChunks: true,
        renderModernChunks: true,
      }),
      // 自动导入组件（如 <el-button>）
      Components({
        resolvers: [
          ElementUIResolver()
        ],
        version: 2.7,
        dts: true
      }),
    ],
    css: {
      preprocessorOptions: {
        scss: {
          // 1. 指定使用现代 API（Vite 8 默认即为 modern，显式声明更稳妥）
          api: 'modern', 
          
          // 2. 使用 @use 引入全局文件
          // 注意：末尾的分号 `;` 不能省略
          additionalData: `
            @use "@/styles/variables.scss" as *;
            @use "@/styles/mixin.scss" as *;
          `
        },
      }
    },
    server: {
      // 是否开启 https
      https: false,
      // 端口号
      port: env.VITE_PORT,
      // 监听所有地址
      host: '0.0.0.0',
      // 服务启动时是否自动打开浏览器
      open: true,
      // 允许跨域
      cors: true,
      // 自定义代理规则
      proxy:
        env.VITE_MOCK === 'false' ? {
          [env.VITE_APP_BASE_API]: {
            target: env.VITE_APP_PROXY_URL,
            changeOrigin: true
          }
        } : undefined
    },
    resolve: {
      mainFields: ['browser', 'module', 'main'],
      alias: [
        { find: '@', replacement: resolve('src') }
      ]
    },
    optimizeDeps: {
      // exclude: ['element-ui']
    },
    build: {
      outDir: env.VITE_OUTDIR,
      assetsDir: env.VITE_ASSETS_DIR,
      sourcemap: false,
      cssCodeSplit: true,
      assetsInlineLimit: 40960, // 将小于 40KB 的 CSS 自动内联进 JS 或 HTML 中
      chunkSizeWarningLimit: 500, // 以 kB 为单位
      reportCompressedSize: false,
      oxcOptions: {
        compress: {
          drop_console: true,     // 移除所有 console.*
          drop_debugger: true,    // 移除 debugger
          pure_funcs: ['console.log'] // 移除 console.log
        },
        mangle: true // 开启变量名混淆（默认已开启，显式写出来更清晰）
      },
      rolldownOptions: {
        output: {
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'static/[name]-[hash].[ext]',
          chunkFileNames: 'chunks/[name]-[hash].js',
          cleanDir: true,
          sourcemap: false,
          codeSplitting: {
            groups: [
              {
                name: 'table-vendor',
                test: /node_modules[\\/]vue-easytable/,
                priority: 30
              },
              {
                name: 'vue-vendors',
                test: /node_modules[\\/]vue/,
                priority: 20
              },
              {
                name: 'ui-vendor',
                test: /node_modules[\\/]element-ui/,
                priority: 15
              },
              {
                name: 'vendor',
                test: /node_modules/,
                priority: 10,
              },
              {
                name: 'common',
                minShareCount: 2,
                minSize: 10000,
                priority: 5,
              }
            ],
          }
        }
      }
    },
  }
})
