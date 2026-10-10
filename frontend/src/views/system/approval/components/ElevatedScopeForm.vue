<template>
  <el-form :model="local" label-width="115px" class="approval-form">
    <el-form-item label="资源"><el-input :value="local.resource" maxlength="128" placeholder="请输入业务资源编码"
      @input="updateField('resource', $event)" /></el-form-item>
    <approval-scope-selector :value="local" :metadata="metadata" @input="syncScope" />
    <el-form-item label="申请原因"><el-input :value="local.reason" type="textarea" maxlength="255" show-word-limit @input="updateField('reason', $event)" /></el-form-item>
    <el-form-item label="申请有效期"><approval-expiry-picker :value="local.expiresAt" :metadata="kindMeta" @input="updateField('expiresAt', $event)" /></el-form-item>
  </el-form>
</template>

<script>
import ApprovalScopeSelector from './ApprovalScopeSelector.vue'
import ApprovalExpiryPicker from './ApprovalExpiryPicker.vue'
import { formModel } from './form-model'

export default {
  name: 'ElevatedScopeForm',
  components: { ApprovalScopeSelector, ApprovalExpiryPicker },
  mixins: [formModel],
  props: { metadata: { type: Object, default: () => ({}) }, kindMeta: { type: Object, default: () => ({}) } },
  methods: {
    syncScope(value) {
      this.local = { ...this.local, ...value }
      this.$emit('input', this.local)
    },
  },
}
</script>
