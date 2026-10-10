<template>
  <el-form :model="local" label-width="115px" class="approval-form">
    <el-form-item label="目标用户"><el-select :value="local.userRef" filterable remote clearable :loading="loading"
      :remote-method="searchUsers" placeholder="请选择用户" class="target-select"
      @input="updateField('userRef', $event)" @visible-change="$emit('user-visible', $event)">
      <el-option v-for="item in users" :key="item.targetRef" :label="item.displayName + '（' + item.username + '）'" :value="item.targetRef" />
    </el-select></el-form-item>
    <el-form-item label="目标角色"><el-select :value="local.roleRef" filterable remote clearable :loading="loading"
      :remote-method="searchRoles" placeholder="请选择角色" class="target-select"
      @input="updateField('roleRef', $event)" @visible-change="$emit('role-visible', $event)">
      <el-option v-for="item in roles" :key="item.targetRef" :label="item.name + '（' + item.roleType + '）'" :value="item.targetRef" />
    </el-select></el-form-item>
    <el-form-item label="申请原因"><el-input :value="local.reason" type="textarea" maxlength="255" show-word-limit @input="updateField('reason', $event)" /></el-form-item>
    <el-form-item label="申请有效期"><approval-expiry-picker :value="local.expiresAt" :metadata="kindMeta" @input="updateField('expiresAt', $event)" /></el-form-item>
  </el-form>
</template>

<script>
import ApprovalExpiryPicker from './ApprovalExpiryPicker.vue'
import { formModel } from './form-model'

export default {
  name: 'RoleRevokeForm',
  components: { ApprovalExpiryPicker },
  mixins: [formModel],
  props: { users: Array, roles: Array, loading: Boolean, kindMeta: { type: Object, default: () => ({}) } },
  methods: {
    searchUsers(keyword) { this.$emit('search-users', keyword || '') },
    searchRoles(keyword) { this.$emit('search-roles', keyword || '') },
  },
}
</script>

<style scoped>
.target-select { width: 420px; max-width: 100%; }
</style>
