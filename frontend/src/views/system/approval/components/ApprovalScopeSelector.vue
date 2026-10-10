<template>
  <div class="approval-scope-selector">
    <el-form-item label="授权范围" required>
      <el-radio-group v-model="local.scopeType" @change="handleScopeTypeChange">
        <el-radio-button v-for="scope in scopeTypeOptions" :key="scope.value" :label="scope.value">{{ scope.label }}</el-radio-button>
      </el-radio-group>
    </el-form-item>
    <div v-if="local.scopeType === 'CUSTOM'" class="custom-scope-panel">
      <div class="custom-scope-header"><div><strong>指定目标</strong></div><span class="target-count">{{ local.targets.length }}/{{ maxTargets }}</span></div>
      <div v-if="!local.targets.length" class="scope-empty">请添加至少一个目标。</div>
      <div v-for="target in local.targets" :key="target.key" class="approval-target-row">
        <el-select v-model="target.targetType" class="target-type" @change="emitValue"><el-option v-for="type in targetTypeOptions" :key="type.value" :label="type.label" :value="type.value" /></el-select>
        <el-input v-model.trim="target.targetId" class="target-id" maxlength="36" placeholder="请输入目标 ID" @input="emitValue" />
        <el-button type="text" class="remove-target" @click="removeTarget(target)">移除</el-button>
      </div>
      <el-button plain size="small" icon="el-icon-plus" :disabled="local.targets.length >= maxTargets" @click="addTarget">添加目标</el-button>
    </div>
  </div>
</template>

<script>
const MAX_TARGETS = 200
function cloneValue(value) { const source = value || {}; return { scopeType: source.scopeType || 'CUSTOM', targets: (source.targets || []).map((target, index) => ({ key: target.key || `${index}-${target.targetType || 'USER'}-${target.targetId || ''}`, targetType: target.targetType || 'USER', targetId: target.targetId || '' })) } }
export default {
  name: 'ApprovalScopeSelector',
  props: { value: { type: Object, default: () => ({}) }, metadata: { type: Object, default: () => ({}) } },
  data() { return { local: cloneValue(this.value), sequence: 0 } },
  computed: {
    maxTargets() { const configured = Number(this.metadata.maxTargets); return Number.isInteger(configured) && configured > 0 ? Math.min(configured, MAX_TARGETS) : MAX_TARGETS },
    scopeTypeOptions() { return this.metadata.scopeTypeOptions || [] },
    targetTypeOptions() { return (this.metadata.targetTypeOptions || []).filter((item) => ['USER', 'DEPARTMENT', 'ORGANIZATION', 'TENANT'].includes(item.value)) },
  },
  watch: { value: { deep: true, handler(value) { const next = cloneValue(value); if (JSON.stringify(next) !== JSON.stringify(this.local)) this.local = next } } },
  methods: {
    emitValue() { this.$emit('input', { scopeType: this.local.scopeType, targets: this.local.targets.map((target) => ({ targetType: target.targetType, targetId: target.targetId })) }) },
    handleScopeTypeChange() { if (this.local.scopeType === 'ALL') this.local.targets = []; this.emitValue() },
    addTarget() { if (this.local.targets.length >= this.maxTargets) return; this.sequence += 1; this.local.targets.push({ key: `new-${this.sequence}`, targetType: this.targetTypeOptions[0]?.value || 'USER', targetId: '' }); this.emitValue() },
    removeTarget(target) { const index = this.local.targets.indexOf(target); if (index >= 0) { this.local.targets.splice(index, 1); this.emitValue() } },
  },
}
</script>

<style scoped>
.approval-scope-selector { margin-bottom: 0; }
.custom-scope-panel { margin: 0 0 14px 115px; padding: 12px; border: 1px solid #ebeef5; border-radius: 4px; }
.custom-scope-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.custom-scope-header strong { color: #606266; font-size: 13px; }
.custom-scope-header p { margin: 4px 0 0; color: #909399; font-size: 12px; line-height: 1.5; }
.target-count { color: #909399; font-size: 12px; white-space: nowrap; }
.scope-empty { margin: 0 0 10px; padding: 9px 12px; border: 1px dashed #dcdfe6; color: #909399; font-size: 12px; text-align: center; }
.approval-target-row { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
.target-type { width: 150px; }
.target-id { flex: 1; }
.remove-target { flex: 0 0 auto; }
</style>
