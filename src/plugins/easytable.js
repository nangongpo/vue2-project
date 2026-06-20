import { VeTable, VePagination, VeIcon, VeLoading, VeLocale } from "vue-easytable"
import zhCN from "vue-easytable/libs/locale/lang/zh-CN"

// import "vue-easytable/libs/theme-default/index.css"
import "vue-easytable/libs/theme-default/base.css"
import "vue-easytable/libs/theme-default/ve-table.css"
// import "vue-easytable/libs/theme-default/ve-pagination.css"
import "vue-easytable/libs/theme-default/ve-icon.css"
import "vue-easytable/libs/theme-default/ve-loading.css"

export default {
  install(Vue, opts = {}) {
    VeLocale.use(zhCN)

    Vue.use(VeTable)
    // Vue.use(VePagination)
    Vue.use(VeIcon)
    Vue.use(VeLoading)

    Vue.prototype.$veLoading = VeLoading
    // Vue.prototype.$veLocale = VeLocale
  }
}
