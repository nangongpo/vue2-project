import router, { resetRouter } from './router'
import store from './store'

const whiteList = ['/login']

router.beforeEach(async(to, from, next) => {
  // start progress bar
  // NProgress.start()

  if (whiteList.indexOf(to.path) !== -1) {
    next()
    return
  }

  const hasPermission = store.getters.menu_list && store.getters.menu_list.length > 0
  if (hasPermission) {
    next()
    return
  }

  try {
    // HttpOnly Cookie 不能被 JavaScript 读取，必须由后端 /auth/me 确认会话。
    const { menu_list } = await store.dispatch('user/getInfo')
    const accessRoutes = await store.dispatch('permission/generateRoutes', menu_list)
    accessRoutes.forEach(item => router.addRoute(item))
    next({ ...to, replace: true })
  } catch (error) {
    await store.dispatch('user/resetToken')
    resetRouter()
    next(`/login?redirect=${to.path}`)
  }
})

router.afterEach(() => {
  // finish progress bar
  // NProgress.done()
})
