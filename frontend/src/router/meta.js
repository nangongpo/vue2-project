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
  '/business': {
    layout: false,
    title: '业务目录',
    name: 'business-info',
    icon: 'nested',
    permission: 'page.business.add',
  },
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
      { label: '新增', value: 'insert', permission: 'system.user.create', api: '/users' },
      { label: '修改', value: 'update', permission: 'system.user.update', api: '/users/:id' },
      {
        label: '重置密码',
        value: 'reset_password',
        permission: 'system.user.reset-password',
        api: '/user/reset_password/',
      },
    ],
  },
  '/system/role': {
    title: '角色管理',
    name: 'role-info',
    icon: 'role-info',
    roleType: 'system',
    permission: 'page.system.role',
    api: '/role/page/',
    buttons: [
      { label: '新增', value: 'insert', permission: 'system.role.create', api: '/roles' },
      { label: '修改', value: 'update', permission: 'system.role.update', api: '/roles/:id' },
      { label: '删除', value: 'delete', permission: 'system.role.delete', api: '/roles/:id' },
    ],
  },
  '/system/audit': {
    title: '审计日志',
    name: 'audit-info',
    icon: 'user-log',
    roleType: 'system',
    permission: 'page.system.audit',
  },
  '/system/health': {
    title: '系统状态',
    name: 'system-health',
    icon: 'platform-manage',
    roleType: 'system',
    permission: 'page.system.health',
  },
  '/system/session': {
    title: '会话管理',
    name: 'session-info',
    icon: 'user',
    authenticatedOnly: true,
  },
  '/system/permission': {
    title: '权限管理',
    name: 'permission-info',
    icon: 'platform-manage',
    roleType: 'system',
    permission: 'page.system.permission',
  },
  '/system/permission/api': {
    title: '接口管理',
    name: 'permission-api',
    icon: 'platform-manage',
    permission: 'page.system.api',
  },
  '/system/permission/approval': {
    title: '授权审批',
    name: 'permission-approval',
    icon: 'platform-manage',
    permission: 'page.system.approval',
  },
  '/system/ops-tickets': {
    title: '运维应急工单',
    name: 'ops-tickets',
    icon: 'platform-manage',
    roleType: 'system',
    permission: 'page.system.ops-tickets',
  },
  '/system/ops-tickets/create': {
    title: '新建应急工单',
    name: 'ops-ticket-create',
    hidden: true,
    permission: 'page.system.ops-tickets',
  },
  '/system/ops-tickets/:id': {
    title: '应急工单详情',
    name: 'ops-ticket-detail',
    hidden: true,
    permission: 'page.system.ops-tickets',
  },
}
