<template>
  <div v-loading="loading" class="session-list">
    <div v-for="session in sessions" :key="session.id" class="session-item">
      <div class="session-icon"><i class="el-icon-monitor" /></div>
      <div class="session-main">
        <div class="session-title">
          {{ session.current ? '当前设备' : '其他设备' }}
          <el-tag v-if="session.current" type="success" size="mini">当前会话</el-tag>
        </div>
        <div class="session-detail">{{ session.userAgent || '未知设备' }}</div>
        <div class="session-detail">
          登录地址：{{ session.ip || '未知' }} · 最近活跃：{{ formatDate(session.lastSeenAt) }}
        </div>
      </div>
      <el-button
        v-if="!session.current"
        type="text"
        class="danger-action"
        @click="$emit('revoke', session)"
        >撤销</el-button
      >
    </div>
    <el-empty v-if="!loading && !sessions.length" description="暂无有效登录设备" />
  </div>
</template>

<script>
export default {
  name: 'SessionList',
  props: {
    sessions: { type: Array, default: () => [] },
    loading: Boolean,
    formatDate: { type: Function, required: true },
  },
}
</script>

<style lang="scss" scoped>
.session-list {
  margin-top: 16px;
}
.session-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 0;
  border-bottom: 1px solid #ebeef5;
}
.session-item:last-child {
  border-bottom: 0;
}
.session-icon {
  width: 38px;
  height: 38px;
  line-height: 38px;
  text-align: center;
  color: #409eff;
  background: #ecf5ff;
  border-radius: 50%;
  font-size: 20px;
}
.session-main {
  flex: 1;
  min-width: 0;
}
.session-title {
  margin-bottom: 6px;
  font-weight: 600;
}
.session-detail {
  overflow: hidden;
  color: #7a8492;
  font-size: 13px;
  line-height: 22px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.danger-action {
  color: #f56c6c;
}
@media (max-width: 768px) {
  .session-detail {
    white-space: normal;
  }
}
</style>
