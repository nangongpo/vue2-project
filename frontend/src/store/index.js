import Vue from 'vue'
import Vuex from 'vuex'
import getters from './getters'

Vue.use(Vuex)

const modulesFiles = import.meta.glob('./modules/*.js', { import: 'default',
eager: true })

const modules = {}

for (const path in modulesFiles) {
  const moduleName = path.replace(/^\.\/modules\/(.*)\.\w+$/, '$1')
  modules[moduleName] = modulesFiles[path]
}

const store = new Vuex.Store({
  modules,
  getters
})

export default store
