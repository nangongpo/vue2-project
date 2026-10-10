<template>
  <div class="system-health-page">
    <div class="page-header">
      <div>
        <h2>系统状态</h2>
        <p>查看后台核心服务和关键依赖的运行状态</p>
      </div>
      <div class="page-actions">
        <span v-if="checkedAt" class="checked-at">最近检查：{{ formatTime(checkedAt) }}</span>
        <el-switch v-model="autoRefresh" active-text="自动刷新" @change="handleRefreshChange" />
        <el-button type="primary" icon="el-icon-refresh" :loading="loading" @click="loadStatus">
          立即检查
        </el-button>
      </div>
    </div>

    <el-alert
      :title="statusMeta?.statusLabel || '—'"
      :description="statusMeta?.statusDescription || '—'"
      :type="statusMeta?.statusTone || 'info'"
      :closable="false"
      show-icon
      class="overall-alert" />

    <div class="service-grid">
      <el-card v-for="service in services" :key="service.name" class="service-card" shadow="hover">
        <div class="service-card-header">
          <div class="service-name">{{ serviceLabel(service.name) }}</div>
          <el-tag :type="service.statusTone || 'info'" size="small">{{ service.statusLabel || '—' }}</el-tag>
        </div>
        <div class="service-latency">
          {{ service.latencyMs === null ? '—' : `${service.latencyMs} ms` }}
        </div>
        <div class="service-impact">影响：{{ service.impact }}</div>
        <div class="service-time">检查：{{ formatTime(service.checkedAt) }}</div>
      </el-card>
    </div>

    <el-card class="service-table-card" shadow="never">
      <div slot="header" class="table-title">依赖服务明细</div>
      <el-table v-loading="loading" :data="services" stripe>
        <el-table-column prop="name" label="服务" min-width="150">
          <template slot-scope="scope">{{ serviceLabel(scope.row.name) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="120">
          <template slot-scope="scope">
            <el-tag :type="scope.row.statusTone || 'info'" size="small">{{ scope.row.statusLabel || '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="延迟" width="120">
          <template slot-scope="scope">{{ scope.row.latencyMs === null ? '—' : `${scope.row.latencyMs} ms` }}</template>
        </el-table-column>
        <el-table-column prop="impact" label="影响范围" min-width="280" />
        <el-table-column label="最近检查" min-width="180">
          <template slot-scope="scope">{{ formatTime(scope.row.checkedAt) }}</template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import dayjs from 'dayjs'
import { getSystemStatus } from '@/api/system'

export default {
  name: 'SystemHealth',
  data() {
    return {
      loading: false,
      autoRefresh: true,
      timer: null,
      overallStatus: 'unknown',
      checkedAt: '',
      services: [],
      statusMeta: null,
    }
  },
  computed: {
  },
  created() {
    this.loadStatus()
  },
  beforeDestroy() {
    this.clearTimer()
  },
  methods: {
    async loadStatus() {
      if (this.loading) return
      this.loading = true
      try {
        const result = await getSystemStatus()
        this.overallStatus = result.status || 'unknown'
        this.statusMeta = result
        this.checkedAt = result.checkedAt || ''
        this.services = Array.isArray(result.services) ? result.services : []
      } catch (error) {
        this.overallStatus = 'unavailable'
        this.statusMeta = null
        this.services = []
        this.$message.error(error.message || '系统状态检查失败')
      } finally {
        this.loading = false
      }
    },
    handleRefreshChange(enabled) {
      this.clearTimer()
      if (enabled) this.timer = window.setInterval(() => this.loadStatus(), 30 * 1000)
    },
    clearTimer() {
      if (this.timer) window.clearInterval(this.timer)
      this.timer = null
    },
    serviceLabel(name) {
      return { mysql: 'MySQL', redis: 'Redis', 'captcha-service': 'captcha-service' }[name] || name
    },
    formatTime(value) {
      return value ? dayjs(value).format('YYYY-MM-DD HH:mm:ss') : '—'
    },
  },
}
</script>

<style scoped>
.system-health-page { padding: 20px; }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 18px; }
.page-header h2 { margin: 0 0 8px; color: #303133; font-size: 22px; }
.page-header p { margin: 0; color: #909399; }
.page-actions { display: flex; align-items: center; gap: 16px; }
.checked-at { color: #909399; font-size: 13px; }
.overall-alert { margin-bottom: 18px; }
.service-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 18px; }
.service-card { min-height: 150px; }
.service-card-header { display: flex; justify-content: space-between; align-items: center; }
.service-name { color: #303133; font-size: 16px; font-weight: 600; }
.service-latency { margin: 22px 0 10px; color: #303133; font-size: 28px; font-weight: 600; }
.service-impact, .service-time { color: #909399; font-size: 13px; line-height: 1.8; }
.table-title { color: #303133; font-weight: 600; }
@media (max-width: 900px) {
  .page-header { align-items: flex-start; flex-direction: column; }
  .service-grid { grid-template-columns: 1fr; }
}
</style>
