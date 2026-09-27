const getters = {
  sidebar: (state) => state.app.sidebar,
  size: (state) => state.app.size,
  device: (state) => state.app.device,
  visitedViews: (state) => state.tagsView.visitedViews,
  cachedViews: (state) => state.tagsView.cachedViews,
  menu_list: (state) => state.user.menu_list,
  permission_routes: (state) => state.permission.routes,
  userInfo: (state) => state.user.user_info,
  allOptions: (state) => state.user.all_options,
  loginInfoPending: (state) => state.user.login_info_pending,
  errorLogs: (state) => state.errorLog.logs,
}
export default getters
