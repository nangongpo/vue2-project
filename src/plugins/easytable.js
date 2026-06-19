import { VeTable, VePagination, VeIcon, VeLoading, VeLocale } from "vue-easytable"
import "vue-easytable/libs/theme-default/index.css"
import zhCN from "vue-easytable/libs/locale/lang/zh-CN"

export default {
  install(Vue, opts = {}) {
    VeLocale.use(zhCN)

    Vue.use(VeTable)
    Vue.use(VePagination)
    Vue.use(VeIcon)
    Vue.use(VeLoading)

    Vue.prototype.$veLoading = VeLoading
    // Vue.prototype.$veLocale = VeLocale
  }
}