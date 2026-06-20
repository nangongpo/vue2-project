import Vue from "vue"
import App from "./App.vue"
import router from './router'
import store from './store'
// import ElementUI from './plugins/element.js'
// import EasyTable from './plugins/easytable.js'

// Vue.use(ElementUI, { size: 'small' })
// Vue.use(EasyTable)

new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
