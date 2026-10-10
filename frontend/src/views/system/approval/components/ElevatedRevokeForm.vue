<template>
  <el-form :model="local" label-width="115px" class="approval-form">
    <el-form-item label="授权范围 ID"><el-input :value="local.scopeId" placeholder="请输入已审批的数据范围 ID"
      @input="updateField('scopeId', $event)" /></el-form-item>
    <el-form-item label="申请原因"><el-input :value="local.reason" type="textarea" maxlength="255" show-word-limit @input="updateField('reason', $event)" /></el-form-item>
    <el-form-item label="申请有效期"><approval-expiry-picker :value="local.expiresAt" :metadata="kindMeta" @input="updateField('expiresAt', $event)" /></el-form-item>
  </el-form>
</template>

<script>
import { formModel } from './form-model'
import ApprovalExpiryPicker from './ApprovalExpiryPicker.vue'
export default { name: 'ElevatedRevokeForm', components: { ApprovalExpiryPicker }, mixins: [formModel], props: { kindMeta: { type: Object, default: () => ({}) } } }
</script>
