import et from 'element-theme-replace'
const configPath = 'src/styles/element-variables.scss'
const outPath = 'src/theme'

// 生成样式变量文件
// et.init(variablePath)

// 实时编译模式
// et.watch({
//   config: configPath,
//   out: outPath
// })

// 编译
et.run({
  config: configPath, // 配置参数文件路径 默认`./element-variables.scss`
  out: outPath, // 输出目录 默认`./theme`
  minimize: false, // 压缩文件
  debug: false, // 调试模式
  // components: ['button', 'input'] // 选定组件构建自定义主题
})
