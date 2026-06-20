import Vue from 'vue'
import VueRouter from 'vue-router'
import { loadElementUI, isElementReady } from '@/utils/element-loader'

// hack router push callback
const originalPush = VueRouter.prototype.push
VueRouter.prototype.push = function push(location, onResolve, onReject) {
  if (onResolve || onReject) return originalPush.call(this, location, onResolve, onReject)
  return originalPush.call(this, location).catch(err => err)
}

Vue.use(VueRouter)

// 扫描 views 目录下所有的 .vue 文件
// 默认就是异步懒加载模式 (Lazy Loading)，完美对标生成环境分包
const modules = import.meta.glob('/src/views/**/*.vue')

// Meta映射表（按需声明即可，未声明的页面 meta 为空对象）
const pageMetaMap = {
  '/login': { title: '登录' },
  '/dashboard': { title: '首页', keepAlive: true },
  '/system/user': { title: '用户管理', requiresAuth: true },
  '/system/user/:id': { title: '用户详情', requiresAuth: true },
  '/system/role': { title: '角色管理', requiresAuth: true },
}

// 自动动态生成路由表
const autoRoutes = Object.keys(modules).map((filePath) => {
  // 1. 清洗路径，算出标准的 URL path
  // 例如：/src/views/users/index.vue -> /users/index
  let routePath = filePath
    .replace('/src/views', '')
    .replace('.vue', '')
    
  // 2. 兼容首页：把 /users/index 变成 /users，把 /index 变成 /
  if (routePath.endsWith('/index')) {
    routePath = routePath.replace('/index', '')
  }
  if (routePath === '') {
    routePath = '/'
  }

  // 3. 兼容动态参数：把 /[id] 替换为 Vue Router 识别的 :id
  routePath = routePath.replace(/\[(.+?)\]/g, ':$1')

  // 4. 自动化生成唯一的 name (完美对标 Nuxt 规范)
  const routeName = routePath === '/' 
    ? 'index' 
    : routePath.replace(/^\//, '').replace(/:/g, '').replace(/\//g, '-')

  let meta = {}

  // [规则一]：基于目录结构的自动规则（比如 admin 文件夹下的页面全部自动需要登录）
  if (routePath.startsWith('/admin')) {
    meta.requiresAuth = true
  }

  console.log(routePath)

  // [规则二]：基于上面配置表的高级精准匹配
  if (pageMetaMap[routePath]) {
    meta = { ...meta, ...pageMetaMap[routePath] }
  }

  return {
    path: routePath,
    name: routeName,
    meta: meta,
    component: modules[filePath]
  }
})

console.log(autoRoutes)

const createRouter = () => new VueRouter({
  mode: import.meta.env.VITE_ROUTER_HISTORY, // require service support
  base: import.meta.env.BASE_URL,
  scrollBehavior: () => ({ x: 0, y: 0 }),
  routes: autoRoutes
})

const router = createRouter()

// Detail see: https://github.com/vuejs/vue-router/issues/1234#issuecomment-357941465
export function resetRouter() {
  const newRouter = createRouter()
  router.matcher = newRouter.matcher // reset router
}

router.beforeEach(async (to, from, next) => {
  if (sessionStorage.getItem('token') && !isElementReady()) {
    await loadElementUI(Vue);
  }
  next();
});

export default router
