<template>
  <el-card class="status-card" shadow="never">
    <div class="section-title">安全状态</div>
    <div class="status-grid">
      <div class="status-item">
        <span>多因素认证</span>
        <span>
          <el-tag :type="securityUser.mfaEnabled ? 'success' : 'warning'">
            {{ securityUser.mfaEnabled ? '已启用' : '未启用' }}
          </el-tag>
        </span>
      </div>
      <div class="status-item">
        <span>有效登录设备</span><strong>{{ sessionsCount }} 个</strong>
      </div>
      <div class="status-item">
        <span>最近重新认证</span><strong>{{ formatDate(securityUser.reauthenticatedAt) }}</strong>
      </div>
    </div>
    <el-alert
      v-if="securityUser.mfaRequired && !securityUser.mfaEnabled"
      class="status-warning"
      title="管理员账号必须完成 MFA 绑定后才能使用管理功能。"
      type="warning"
      :closable="false" />
  </el-card>
</template>

<script>
export default {
  name: 'StatusCard',
  props: {
    securityUser: { type: Object, default: () => ({}) },
    sessionsCount: { type: Number, default: 0 },
    formatDate: { type: Function, required: true },
  },
}
</script>

<style lang="scss" scoped>
.status-card {
  margin-bottom: 16px;
}
.section-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-top: 18px;
}
.status-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  background: #f7f9fc;
  border-radius: 6px;
}
.status-warning {
  margin-top: 16px;
}
@media (max-width: 768px) {
  .status-grid {
    grid-template-columns: 1fr;
  }
}
</style>
