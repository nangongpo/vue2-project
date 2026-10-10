<template>
  <el-form :model="local" label-width="115px" class="approval-form">
    <el-form-item label="目标角色"><el-select :value="local.roleRef" filterable remote clearable :loading="loading"
      :remote-method="searchRoles" placeholder="请选择角色" class="target-select"
      @input="updateField('roleRef', $event)" @visible-change="$emit('role-visible', $event)">
      <el-option v-for="item in roles" :key="item.targetRef" :label="item.name + '（' + item.roleType + '）'" :value="item.targetRef" />
    </el-select></el-form-item>
    <el-form-item label="目标状态">
      <el-select :value="local.status" @input="updateField('status', $event)"><el-option label="停用" value="DISABLED" /></el-select>
    </el-form-item>
    <el-form-item label="申请原因"><el-input :value="local.reason" type="textarea" maxlength="255" show-word-limit @input="updateField('reason', $event)" /></el-form-item>
    <el-form-item label="申请有效期"><approval-expiry-picker :value="local.expiresAt" :metadata="kindMeta" @input="updateField('expiresAt', $event)" /></el-form-item>
  </el-form>
</template>

<script>
import ApprovalExpiryPicker from './ApprovalExpiryPicker.vue'
import { formModel } from './form-model'

export default {
  name: 'RoleStatusForm',
  components: { ApprovalExpiryPicker },
  mixins: [formModel],
  props: { roles: Array, loading: Boolean, kindMeta: { type: Object, default: () => ({}) } },
  methods: {
    searchRoles(keyword) { this.$emit('search-roles', keyword || '') },
  },
}
</script>

<style scoped>
.target-select { width: 420px; max-width: 100%; }
</style>
