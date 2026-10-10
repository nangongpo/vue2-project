<template>
  <el-button
    v-if="visible"
    v-bind="$attrs"
    v-on="$listeners">
    <span v-if="actionLabel">{{ actionLabel }}</span>
    <slot v-else />
  </el-button>
</template>

<script>
import store from '@/store'
import { findAvailableAction } from '@/utils/available-action'

function normalizePermissions(value) {
  return Array.isArray(value) ? value : [value]
}

function hasExplicitPermission(required, granted) {
  const requiredPermissions = normalizePermissions(required)
  if (!requiredPermissions.length || requiredPermissions.some((item) => typeof item !== 'string' || !item.trim())) {
    return false
  }
  if (!Array.isArray(granted)) return false
  return requiredPermissions.every((permission) => granted.includes(permission))
}

function validAction(action) {
  return !!(
    action &&
    typeof action === 'object' &&
    typeof action.label === 'string' &&
    action.label.trim()
  )
}

export default {
  name: 'PermissionButton',
  props: {
    permission: { type: [String, Array], default: null },
    action: { type: String, default: '' },
    row: { type: Object, default: null },
  },
  computed: {
    hasAccessRule() {
      return this.permission !== null || !!this.action
    },
    permissionAllowed() {
      return this.permission === null
        ? true
        : hasExplicitPermission(this.permission, store.getters.menu_list)
    },
    availableAction() {
      if (!this.action) return null
      const candidate = findAvailableAction(this.row, this.action)
      return validAction(candidate) ? candidate : null
    },
    visible() {
      if (!this.hasAccessRule) return false
      if (!this.permissionAllowed) return false
      return !this.action || !!this.availableAction
    },
    actionLabel() {
      return this.availableAction?.label || ''
    },
  },
}
</script>
