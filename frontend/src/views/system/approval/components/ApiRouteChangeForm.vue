<template>
  <el-form :model="local" label-width="115px" class="approval-form">
    <el-form-item label="目标接口">
      <el-select :value="local.apiId" filterable clearable :loading="apiLoading"
        placeholder="搜索并选择接口" class="api-select" @input="updateField('apiId', $event)">
        <el-option v-for="api in apis" :key="api.id" :label="(api.name || api.code) + '（' + api.code + '）'" :value="api.id">
          <span>{{ api.name || api.code }}</span><small>{{ api.method }} {{ api.path }}</small>
        </el-option>
      </el-select>
    </el-form-item>
    <el-form-item label="新权限码"><el-input :value="local.code" maxlength="128" @input="updateField('code', $event)" /></el-form-item>
    <el-form-item label="新方法"><el-select :value="local.method" @input="updateField('method', $event)">
      <el-option v-for="method in methods" :key="method" :label="method" :value="method" /></el-select></el-form-item>
    <el-form-item label="新路径"><el-input :value="local.path" maxlength="255" placeholder="/api/v1/resource/:id"
      @input="updateField('path', $event)" /></el-form-item>
    <el-form-item label="申请原因"><el-input :value="local.reason" type="textarea" maxlength="255" show-word-limit @input="updateField('reason', $event)" /></el-form-item>
    <el-form-item label="申请有效期"><approval-expiry-picker :value="local.expiresAt" :metadata="kindMeta" @input="updateField('expiresAt', $event)" /></el-form-item>
  </el-form>
</template>

<script>
import { formModel } from './form-model'
import ApprovalExpiryPicker from './ApprovalExpiryPicker.vue'
export default {
  name: 'ApiRouteChangeForm',
  components: { ApprovalExpiryPicker },
  mixins: [formModel],
  props: {
    methods: Array,
    apis: { type: Array, default: () => [] },
    apiLoading: Boolean,
    kindMeta: { type: Object, default: () => ({}) },
  },
}
</script>

<style scoped>
.api-select { width: 100%; max-width: 560px; }
.api-select small { float: right; margin-left: 16px; color: #909399; }
</style>
