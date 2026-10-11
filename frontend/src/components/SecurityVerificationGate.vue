<template>
  <div class="security-verification-gate">
    <div class="security-verification-gate-title">{{ title }}</div>
    <div class="security-verification-gate-text">{{ description }}</div>
    <permission-button :permission="permission" type="primary" :loading="loading" @click="$emit('verify')">
      {{ buttonText }}
    </permission-button>
  </div>
</template>

<script>
export default {
  name: 'SecurityVerificationGate',
  props: {
    permission: { type: String, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    buttonText: { type: String, default: '验证并继续' },
    loading: Boolean,
  },
}
</script>

<style scoped>
.security-verification-gate {
  padding: 28px 20px;
  text-align: center;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafbfc;
}

.security-verification-gate-title {
  color: #303133;
  font-weight: 600;
}

.security-verification-gate-text {
  margin: 8px 0 16px;
  color: #606266;
  font-size: 13px;
}
</style>
