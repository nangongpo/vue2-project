import store from '@/store'
import { findAvailableAction } from '@/utils/available-action'

const permissionDirective = {
  install(Vue) {
    Vue.directive('permission', createAccessDirective({
      stateKey: '__permissionState',
      watcherKey: '__permissionUnwatch',
      apply: applyPermission,
    }))
    Vue.directive('action', createAccessDirective({
      stateKey: '__actionState',
      apply: applyAction,
    }))
  },
}

function applyPermission(el, binding) {
  const state = el.__permissionState
  if (!state) return
  state.binding = binding
  const allowed = hasPermission(binding?.value)
  if (allowed) {
    restoreElement(el, state)
    el.style.display = state.originalDisplay
    if (state.originalAriaHidden === null) el.removeAttribute('aria-hidden')
    else el.setAttribute('aria-hidden', state.originalAriaHidden)
  } else {
    removeUnauthorizedElement(el, state)
  }
}

function applyAction(el, binding) {
  const value = binding.value || {}
  const row = value.row
  const code = value.code
  const state = el.__actionState
  if (!state) return
  const action = findAvailableAction(row, code)

  if (!hasValidActionLabel(action)) {
    removeUnauthorizedElement(el, state)
    return
  }

  restoreElement(el, state)
  el.style.display = state.originalDisplay
  if (state.originalAriaHidden === null) el.removeAttribute('aria-hidden')
  else el.setAttribute('aria-hidden', state.originalAriaHidden)
  el.textContent = action.label
}

function hasPermission(required) {
  const permissions = store.getters.menu_list || []
  const requiredPermissions = Array.isArray(required) ? required : [required]
  if (!requiredPermissions.length || requiredPermissions.some((permission) => typeof permission !== 'string' || !permission.trim())) {
    return false
  }
  if (!Array.isArray(permissions)) return false
  return requiredPermissions.every((permission) => permissions.includes(permission))
}

function hasValidActionLabel(action) {
  return !!(
    action &&
    typeof action === 'object' &&
    typeof action.label === 'string' &&
    action.label.trim()
  )
}

function createAccessState(el) {
  return {
    originalDisplay: el.style.display,
    originalAriaHidden: el.getAttribute('aria-hidden'),
    removed: false,
    anchor: null,
    binding: null,
  }
}

function createAccessDirective({ stateKey, watcherKey, apply }) {
  return {
    bind(el, binding) {
      const state = createAccessState(el)
      state.binding = binding
      el[stateKey] = state
      if (watcherKey) {
        el[watcherKey] = store.watch(
          () => store.getters.menu_list,
          () => apply(el, el[stateKey].binding),
          { deep: false }
        )
      }
    },
    inserted(el, binding) {
      apply(el, binding)
    },
    componentUpdated(el, binding) {
      apply(el, binding)
    },
    unbind(el) {
      const state = el[stateKey]
      if (!state) return
      if (watcherKey) {
        el[watcherKey]?.()
        el[watcherKey] = null
      }
      state.anchor?.parentNode?.removeChild(state.anchor)
      el[stateKey] = null
    },
  }
}

function removeUnauthorizedElement(el, state) {
  if (state.removed) return
  if (!el.parentNode) return
  state.removed = true
  if (!state.anchor || state.anchor.parentNode !== el.parentNode) {
    state.anchor = el.ownerDocument.createComment('permission')
    el.parentNode.insertBefore(state.anchor, el)
  }
  el.parentNode.removeChild(el)
}

function restoreElement(el, state) {
  if (!state.removed || !state.anchor?.parentNode) return
  state.anchor.parentNode.insertBefore(el, state.anchor.nextSibling)
  state.removed = false
}

export default permissionDirective
