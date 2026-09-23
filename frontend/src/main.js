import Vue from "vue"
import App from "./App.vue"
import router from './router'
import store from './store'
import './styles/global.scss'

import './icons/index.js'
import './permission.js'
import './directives/permission.js'
// 消息提示单独注册， 其余组件由 unplugin-vue-components 按需导入
import ElementUI from "./plugins/element.js"

Vue.use(ElementUI, {
  size: 'mini'
})

// Loading、Message、MessageBox、Notification 等服务由 AppMain 异步加载。
// import EasyTable from './plugins/easytable.js'

// Vue.use(EasyTable)

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
