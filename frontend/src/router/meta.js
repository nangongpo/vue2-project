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
    layout: true,
    title: '业务目录',
    name: 'business-info',
    icon: 'nested',
  },
  '/business/order-manage': {
    title: '订单管理',
    name: 'order-manage',
    icon: 'nested',
  },
  '/business/test': {
    layout: false,
    title: '测试',
    name: 'business-test',
    icon: 'nested',
  },
  // 业务路由：不写 requiresAuth 默认或者显式声明为 true，都需要登录后动态加载
  '/system': { title: '平台管理' },
  '/system/user': {
    title: '用户管理',
    name: 'user-info',
  },
  '/system/role': {
    title: '角色管理',
    name: 'role-info',
  },
  '/system/audit': {
    title: '审计日志',
    name: 'audit-info',
  },
  '/system/health': {
    title: '系统状态',
    name: 'system-health',
  },
  '/system/session': {
    title: '账号安全',
    name: 'session-info',
  },
  '/system/permission': {
    title: '权限管理',
    name: 'permission-info',
  },
  '/system/api': {
    title: '接口管理',
    name: 'permission-api',
  },
  '/system/approval': {
    title: '授权审批',
    name: 'permission-approval',
  },
  '/system/ops-tickets': {
    title: '运维应急工单',
    name: 'ops-tickets',
  },
  '/system/ops-tickets/create': {
    title: '新建应急工单',
    name: 'ops-ticket-create',
    hidden: true,
  },
  '/system/ops-tickets/:id': {
    title: '应急工单详情',
    name: 'ops-ticket-detail',
    hidden: true,
  },
}
