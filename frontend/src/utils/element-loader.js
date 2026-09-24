// ==========================================
// 内存单例锁（关键）：只要不刷新页面，切页时这两个变量绝对常驻
// ==========================================
let isElementRegistered = false
let globalElementPromise = null

/**
 * 判断 Element UI 是否已经完全挂载就绪
 */
export const isElementReady = () => isElementRegistered

/**
 * 异步按需加载核心引擎（高并发与切页多实例安全锁）
 */
export const loadElementUI = (Vue) => {
  // 锁一：如果已经成功注册过，直接秒开返回，绝不重复加载 JS
  if (isElementRegistered) {
    return Promise.resolve()
  }

  // 锁二（高并发防线）：如果此时正在加载中（比如多个组件在同一个宏任务里同时调用了此方法），
  // 直接返回当前正在挂起的同一个 Promise 实例，所有调用者排队等待这一个结果，绝不触发第二次网络请求！
  if (globalElementPromise) {
    return globalElementPromise
  }

  // 确立原子初始化链路
  globalElementPromise = (async () => {
    try {
      // CSS 已在应用入口静态引入，避免页面渲染后追加 stylesheet 造成全局重算。
      const [
        { default: Loading },
        { default: InfiniteScroll },
        { default: Message },
        { default: MessageBox },
        { default: Notification },
      ] = await Promise.all([
        import('element-ui/lib/loading'),
        import('element-ui/lib/infinite-scroll'),
        import('element-ui/lib/message'),
        import('element-ui/lib/message-box'),
        import('element-ui/lib/notification'),
      ])

      Vue.prototype.$ELEMENT = { size: 'small', zIndex: 2000 }
      Vue.use(Loading.directive)
      Vue.use(InfiniteScroll)
      Vue.prototype.$loading = Loading.service
      Vue.prototype.$msgbox = MessageBox
      Vue.prototype.$alert = MessageBox.alert
      Vue.prototype.$confirm = MessageBox.confirm
      Vue.prototype.$prompt = MessageBox.prompt
      Vue.prototype.$notify = Notification
      Vue.prototype.$message = Message

      isElementRegistered = true
      console.log('✅ [Element UI] 异步单例核心挂载成功，当前链路已锁死。')
    } catch (err) {
      console.error('❌ [Element UI] 异步加载期间捕获异常:', err)
      globalElementPromise = null // 异常时释放锁，允许下次进入页面时重新触发加载重试
      throw err
    }
  })()

  return globalElementPromise
}
