<template>
  <div class="approval-expiry-picker">
    <el-radio-group v-model="mode" size="small" @change="handleModeChange">
      <el-radio-button v-for="minutes in presetMinutes" :key="minutes" :label="'preset:' + minutes">
        {{ durationLabel(minutes) }}
      </el-radio-button>
      <el-radio-button label="custom">自定义</el-radio-button>
    </el-radio-group>
    <div v-if="mode === 'custom'" class="custom-duration">
      <el-input-number v-model="customHours" :min="0" :max="maxHours" :step="1" :precision="0" controls-position="right" @change="emitCustom" />
      <span>小时</span>
      <el-input-number v-model="customMinutes" :min="0" :max="59" :step="5" :precision="0" controls-position="right" @change="emitCustom" />
      <span>分钟</span>
    </div>
    <p class="expiry-hint">最长 {{ maxHours || '—' }} 小时。</p>
    <p v-if="preview" class="expiry-preview">预计到期：{{ preview }}</p>
    <p v-if="error" class="expiry-error">{{ error }}</p>
  </div>
</template>

<script>
import { dateFormat } from '@/utils/date'

export default {
  name: 'ApprovalExpiryPicker',
  props: { value: { type: [String, Date], default: null }, metadata: { type: Object, default: () => ({}) } },
  data() { return { mode: 'custom', customHours: 0, customMinutes: 0, internalUpdate: false, error: '' } },
  computed: {
    maxHours() { const value = Number(this.metadata.maxHours); return Number.isFinite(value) && value > 0 ? value : 0 },
    maxMinutes() { return Math.floor(this.maxHours * 60) },
    minMinutes() { const value = Number(this.metadata.minMinutes); return Number.isInteger(value) && value > 0 ? value : 5 },
    presetMinutes() { return (this.metadata.expiryPresets || []).map((hours) => Math.floor(Number(hours) * 60)).filter((minutes) => minutes > 0 && minutes <= this.maxMinutes) },
    preview() { const date = this.value && new Date(this.value); return date && Number.isFinite(date.getTime()) ? dateFormat(date, 'YYYY-MM-DD HH:mm') : '' },
  },
  watch: {
    metadata: { deep: true, immediate: true, handler() { this.initialize() } },
    value(value) { if (!this.internalUpdate && value) this.syncFromValue(value); this.internalUpdate = false },
  },
  methods: {
    durationLabel(minutes) { if (minutes < 60) return minutes + '分钟'; const hours = minutes / 60; return Number.isInteger(hours) ? hours + '小时' : hours.toFixed(1) + '小时' },
    initialize() { if (!this.maxMinutes) { this.error = '有效期配置不可用'; return } if (this.value) return this.syncFromValue(this.value); const initial = this.presetMinutes[0] || Math.min(60, this.maxMinutes); this.mode = this.presetMinutes.includes(initial) ? 'preset:' + initial : 'custom'; this.setCustomDuration(initial); this.emitExpiration(initial) },
    syncFromValue(value) { const minutes = Math.round((new Date(value).getTime() - Date.now()) / 60000); if (!Number.isFinite(minutes) || minutes <= 0 || minutes > this.maxMinutes) return; if (this.presetMinutes.includes(minutes)) this.mode = 'preset:' + minutes; else { this.mode = 'custom'; this.setCustomDuration(minutes) } },
    setCustomDuration(minutes) { this.customHours = Math.floor(minutes / 60); this.customMinutes = minutes % 60 },
    currentMinutes() { return this.customHours * 60 + this.customMinutes },
    handleModeChange(value) { this.error = ''; if (value === 'custom') { const initial = this.currentMinutes() || this.presetMinutes[0] || Math.min(60, this.maxMinutes); this.setCustomDuration(initial); return this.emitExpiration(initial) } this.emitExpiration(Number(value.split(':')[1])) },
    emitCustom() { this.emitExpiration(this.currentMinutes()) },
    emitExpiration(minutes) { const value = Number(minutes); if (!Number.isInteger(value) || value < this.minMinutes || value > this.maxMinutes) { this.error = `有效期需为 ${this.minMinutes} 分钟至 ${this.maxHours} 小时`; return } this.error = ''; this.internalUpdate = true; this.$emit('input', new Date(Date.now() + value * 60000).toISOString()) },
  },
}
</script>

<style scoped>
.custom-duration { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.custom-duration .el-input-number { width: 105px; }
.expiry-hint, .expiry-preview, .expiry-error { margin: 6px 0 0; font-size: 12px; line-height: 1.5; }
.expiry-hint, .expiry-preview { color: #909399; }
.expiry-error { color: #f56c6c; }
</style>
