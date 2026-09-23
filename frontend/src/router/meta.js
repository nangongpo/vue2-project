
/**
 * public：是否允许未登录访问，仅用于路由守卫。
   dynamic：是否放进 asyncRoutes，默认 true。
   layout：是否使用 Layout，默认 true。
   absoluteChildren：分组子路由是否保留完整绝对路径。
   public: false + dynamic: false：登录后所有用户可访问的常量路由，例如 /redirect、/dashboard。
   public: false + dynamic: true：登录后根据权限动态添加的业务路由。
 */

// 路由meta映射表
export default {
  '/': { layout: false, public: true },
  '/redirect': { dynamic: false, hidden: true, absoluteChildren: true },
  '/login': { layout: false, public: true, hidden: true, name: 'login' },
  '/login/async-index': { layout: false, public: true, hidden: true },
  '/404': { layout: false, dynamic: false, hidden: true, name: 'Page404' },
  '/dashboard': { dynamic: false, title: '首页', icon: 'dashboard', affix: true },
  // 业务路由：不写 requiresAuth 默认或者显式声明为 true，都需要登录后动态加载
  '/system': { title: '平台管理', icon: 'platform-manage' },
  '/system/user': {
    title: '用户管理',
    name: 'user-info',
    icon: 'user-info',
    roleType: 'system',
    permission: 'page.system.user',
    api: '/user/page/',
    buttons: [
      { label: '新增', value: 'insert', permission: 'user:create', api: '/user/insert/' },
      { label: '修改', value: 'update', permission: 'user:update', api: '/user/update/' },
      { label: '重置密码', value: 'reset_password', permission: 'user:reset-password', api: '/user/reset_password/' }
    ]
  },
  '/system/role': {
    title: '角色管理',
    name: 'role-info',
    icon: 'role-info',
    roleType: 'system',
    permission: 'page.system.role',
    api: '/role/page/',
    buttons: [
      { label: '新增', value: 'insert', permission: 'role:create', api: '/role/insert/' },
      { label: '修改', value: 'update', permission: 'role:update', api: '/role/update/' },
      { label: '删除', value: 'delete', permission: 'role:delete', api: '/role/delete/' }
    ]
  },
  '/system/audit': {
    title: '审计日志',
    name: 'audit-info',
    icon: 'user-log',
    roleType: 'system',
    permission: 'page.system.audit'
  },
  '/system/session': {
    title: '会话管理',
    name: 'session-info',
    icon: 'user'
    , permission: 'page.system.session'
  },
}
