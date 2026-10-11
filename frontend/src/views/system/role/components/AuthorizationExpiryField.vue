<template>
  <el-form-item :label="label" :prop="prop" :rules="rules">
    <div class="authorization-expiry-field">
      <el-input-number
        :value="days"
        :min="minDays"
        :max="maxDays"
        :step="1"
        :step-strictly="true"
        controls-position="right"
        @change="updateDays" />
      <span class="authorization-expiry-unit">天</span>
      <span class="authorization-expiry-hint">最多 {{ maxDays }} 天</span>
    </div>
  </el-form-item>
</template>

<script>
const DAY_MS = 24 * 60 * 60 * 1000

export default {
  name: 'AuthorizationExpiryField',
  props: {
    value: { type: [Date, String, Number], default: null },
    label: { type: String, default: '到期时间' },
    prop: { type: String, default: '' },
    rules: { type: Array, default: () => [] },
    minDays: { type: Number, default: 1 },
    maxDays: { type: Number, default: 90 },
    defaultDays: { type: Number, default: 30 },
  },
  data() {
    return { days: this.defaultDays }
  },
  watch: {
    value: {
      immediate: true,
      handler(value) {
        const time = value ? new Date(value).getTime() : NaN
        if (!Number.isFinite(time)) {
          this.days = Math.min(Math.max(this.defaultDays, this.minDays), this.maxDays)
          this.$nextTick(() => {
            if (!this.value) this.updateDays(this.days)
          })
          return
        }
        this.days = Math.min(
          Math.max(Math.ceil((time - Date.now()) / DAY_MS), this.minDays),
          this.maxDays
        )
      },
    },
  },
  mounted() {
    if (!this.value) this.updateDays(this.days)
  },
  methods: {
    updateDays(value) {
      const days = Math.min(
        Math.max(Number(value) || this.minDays, this.minDays),
        this.maxDays
      )
      this.days = days
      // 留出轻微时钟偏差，避免 90 天值经网络延迟后被后端拒绝。
      this.$emit('input', new Date(Date.now() + days * DAY_MS - 1000))
    },
  },
}
</script>

<style scoped>
.authorization-expiry-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.authorization-expiry-unit,
.authorization-expiry-hint {
  color: #606266;
  white-space: nowrap;
}

.authorization-expiry-hint {
  font-size: 12px;
}
</style>
