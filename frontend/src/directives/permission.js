import Vue from 'vue'

function hasPermission(permission) {
  const permissions = Vue.prototype.$store?.getters?.menu_list || []
  return permissions.includes('*') || permissions.includes(permission)
}

Vue.directive('permission', {
  inserted(el, binding) {
    if (!hasPermission(binding.value)) el.parentNode?.removeChild(el)
  },
})
