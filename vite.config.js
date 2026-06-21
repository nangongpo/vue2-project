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

// 自定义移除 crossorigin 属性的轻量插件
const removeCrossoriginPlugin = () => {
  return {
    name: 'remove-crossorigin',
    enforce: 'post', // 确保在最后一轮执行
    
    transformIndexHtml(html) {
      let fixedHtml = html;

      // 1. 精准处理 polyfills-legacy 脚本：去掉 crossorigin，加上 defer，并注入 onload 标记
      const polyfillRegex = /<script([^>]*?)id="vite-legacy-polyfill"([^>]*?)><\/script>/g;
      fixedHtml = fixedHtml.replace(polyfillRegex, (match) => {
        let cleanTag = match.replace(/\s?crossorigin(=['"]anonymous['"])?/g, '');
        if (!cleanTag.includes('defer')) {
          cleanTag = cleanTag.replace('<script', '<script defer');
        }
        // 关键：给补丁加上一个全局变量标记，证明它已经彻底下载并执行完毕
        cleanTag = cleanTag.replace('></script>', ' onload="window.__legacyReady=true; if(window.__runViteLegacyEntry) window.__runViteLegacyEntry();"></script>');
        return cleanTag;
      });

      // 2. 精准处理紧随其后的 vite-legacy-entry 内联脚本：
      // 包装它的执行时机，必须等到 __legacyReady 为 true 时再调用 System.import
      const entryRegex = /<script([^>]*?)id="vite-legacy-entry"([^>]*?)>([\s\S]*?)<\/script>/g;
      fixedHtml = fixedHtml.replace(entryRegex, (match, p1, p2, code) => {
        let cleanAttrs = `${p1}${p2}`.replace(/\s?crossorigin(=['"]?.*?['"]?)?/g, '');
        
        // 组装清洁后的标签，并将核心代码包裹在 window.__runViteLegacyEntry 中延迟执行
        let cleanEntry = `<script ${cleanAttrs} id="vite-legacy-entry">`;
        cleanEntry += `
          window.__runViteLegacyEntry = function() {
            ${code.trim()}
          };
          if (window.__legacyReady) {
            window.__runViteLegacyEntry();
          }
        `;
        cleanEntry += `</script>`;
        return cleanEntry;
      });

      return fixedHtml;
    }
  };
};

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
      // @vitejs/plugin-legacy 不兼容 rollup、rolldown, 配置rollup或rolldown时目前无法同时输出legacy和modern
      legacy({
        // polyfills: ['es.promise', 'es.object.assign'],
        polyfills: true,
        renderLegacyChunks: true,
        renderModernChunks: false,
        modernPolyfills: false,
      }),
      removeCrossoriginPlugin(),
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

          // loadPaths: [fileURLToPath(new URL('./src/styles', import.meta.url))],
          
          // 2. 使用 @use 引入全局文件
          // 注意：末尾的分号 `;` 不能省略
          additionalData: `@use "@/styles/variables.scss" as *;`
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
          assetFileNames: (assetInfo) => {
            // 确保安全读取文件名
            const name = assetInfo.name || '';
            // 匹配字体文件扩展名
            if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(name)) {
              return 'assets/fonts/[name]-[hash][extname]';
            }
            // 匹配 CSS 文件
            if (/\.css$/i.test(name)) {
              return 'assets/css/[name]-[hash][extname]';
            }
            // 其他资产（如图片等）
            return 'assets/[ext]/[name]-[hash][extname]';
          },
          entryFileNames: 'assets/[name]-[hash].js',
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
      },
    },
  }
})
