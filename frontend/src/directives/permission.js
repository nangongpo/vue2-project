import store from '@/store'

function hasPermission(required) {
  const permissions = store.getters.menu_list || []
  const requiredPermissions = Array.isArray(required) ? required : [required]
  return requiredPermissions.filter(Boolean).every((permission) => permissions.includes('*') || permissions.includes(permission))
}

function applyPermission(el, binding) {
  el.__permissionBinding = binding
  const state = el.__permissionState
  const allowed = hasPermission(binding.value)
  if (allowed) {
    el.style.display = state.originalDisplay
    if (state.originalAriaHidden === null) el.removeAttribute('aria-hidden')
    else el.setAttribute('aria-hidden', state.originalAriaHidden)
  } else {
    el.style.display = 'none'
    el.setAttribute('aria-hidden', 'true')
  }
}

const permissionDirective = {
  install(Vue) {
    Vue.directive('permission', {
      bind(el, binding) {
        el.__permissionState = {
          originalDisplay: el.style.display,
          originalAriaHidden: el.getAttribute('aria-hidden'),
        }
        el.__permissionUnwatch = store.watch(
          () => store.getters.menu_list,
          () => applyPermission(el, el.__permissionBinding),
          { deep: false }
        )
        applyPermission(el, binding)
      },
      inserted(el, binding) {
        applyPermission(el, binding)
      },
      update(el, binding) {
        applyPermission(el, binding)
      },
      componentUpdated(el, binding) {
        applyPermission(el, binding)
      },
      unbind(el) {
        el.__permissionUnwatch?.()
        const state = el.__permissionState
        if (!state) return
        el.style.display = state.originalDisplay
        if (state.originalAriaHidden === null) el.removeAttribute('aria-hidden')
        else el.setAttribute('aria-hidden', state.originalAriaHidden)
      },
    })
  },
}

export default permissionDirective
