import Vue from 'vue'
import VueRouter from 'vue-router'
import { constantRoutes } from './auto-router'

// hack router push callback
const originalPush = VueRouter.prototype.push
VueRouter.prototype.push = function push(location, onResolve, onReject) {
  if (onResolve || onReject) return originalPush.call(this, location, onResolve, onReject)
  return originalPush.call(this, location).catch(err => err)
}

const originalReplace = VueRouter.prototype.replace
VueRouter.prototype.replace = function replace(location, onResolve, onReject) {
  if (onResolve || onReject) return originalReplace.call(this, location, onResolve, onReject)
  return originalReplace.call(this, location).catch(err => err)
}

Vue.use(VueRouter)

const createRouter = () => new VueRouter({
  mode: import.meta.env.VITE_ROUTER_HISTORY,
  base: import.meta.env.BASE_URL,
  scrollBehavior: () => ({ x: 0, y: 0 }),
  routes: constantRoutes 
})

const router = createRouter()

export function resetRouter() {
  const newRouter = createRouter()
  router.matcher = newRouter.matcher
}

export default router
