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
        modernPolyfills: true
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
    resolve: {
      alias: [
        { find: '@', replacement: resolve('src') }
      ]
    },
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
    // 关键配置：调整 Vite 的 CommonJS 插件行为
    // build: {
    //   commonjsOptions: {
    //     transformMixedEsModules: true,
    //     // 允许直接将 CJS 的 module.exports 视为 default 导出
    //     defaultIsModuleExports: true 
    //   }
    // },
  }
})
