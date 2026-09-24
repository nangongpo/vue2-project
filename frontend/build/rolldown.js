export function createRolldownOptions(env) {
  return {
    output: {
      assetFileNames: (assetInfo) => {
        const name = assetInfo.name || ''
        if (/\.(woff2?|eot|ttf|otf)(\?.*)?$/i.test(name)) {
          return `${env.VITE_ASSETS_DIR}/fonts/[name]-[hash][extname]`
        }
        if (/\.css$/i.test(name)) {
          return `${env.VITE_ASSETS_DIR}/css/[name]-[hash][extname]`
        }
        return `${env.VITE_ASSETS_DIR}/[ext]/[name]-[hash][extname]`
      },
      entryFileNames: `${env.VITE_ASSETS_DIR}/[name]-[hash].js`,
      chunkFileNames: `${env.VITE_ASSETS_DIR}/[name]-[hash].js`,
      codeSplitting: {
        groups: [
          {
            name: 'vue-vendors',
            test: /node_modules[\\/](vue|@vue[\\/]|vue-router)[\\/]/,
            priority: 25,
          },
          {
            name: 'element-core',
            test: /node_modules[\\/]element-ui[\\/](lib[\\/](loading|message|message-box|notification|infinite-scroll))/, 
            priority: 19,
          },
          {
            name: 'element-vendor',
            test: /node_modules[\\/]element-ui/,
            priority: 17,
          },
          {
            name: 'ui-vendor',
            test: /node_modules[\\/]element-ui/,
            priority: 15,
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
          },
        ],
      },
    },
  }
}
