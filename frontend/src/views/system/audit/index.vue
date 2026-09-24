<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="query.keyword"
          clearable
          placeholder="操作/资源/路径"
          @keyup.enter.native="loadLogs" />
        <el-select v-model="query.result" clearable placeholder="执行结果">
          <el-option label="成功" value="SUCCESS" />
          <el-option label="失败" value="FAILURE" />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="datetimerange"
          range-separator="至"
          start-placeholder="开始时间"
          end-placeholder="结束时间"
          value-format="yyyy-MM-ddTHH:mm:ss.SSSZ" />
        <el-button type="primary" @click="search">查询</el-button>
        <el-button v-permission="'system.audit.export'" :loading="exporting" @click="exportLogs"
          >导出</el-button
        >
      </div>
      <el-table v-loading="loading" :data="logs" border stripe>
        <el-table-column label="操作时间" width="170">
          <template slot-scope="scope">
            {{ formatDate(scope.row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作用户" width="150">
          <template slot-scope="scope">
            {{
              scope.row.actor
                ? `${scope.row.actor.displayName} (${scope.row.actor.username})`
                : '系统'
            }}
          </template>
        </el-table-column>
        <el-table-column label="操作类型" min-width="180">
          <template slot-scope="scope">
            {{ actionLabel(scope.row.action) }}
          </template>
        </el-table-column>
        <el-table-column prop="method" label="请求方法" width="100" />
        <el-table-column prop="path" label="接口路径" min-width="220" />
        <el-table-column label="执行结果" width="100">
          <template slot-scope="scope">
            <el-tag :type="scope.row.result === 'SUCCESS' ? 'success' : 'danger'">
              {{ scope.row.result === 'SUCCESS' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="statusCode" label="HTTP状态码" width="110" />
        <el-table-column prop="ip" label="来源IP" width="140" />
        <el-table-column label="详情" width="90" fixed="right">
          <template slot-scope="scope">
            <el-button
              v-permission="'system.audit.detail'"
              type="text"
              @click="showDetail(scope.row)">
              查看详情
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pagination"
        background
        layout="total, prev, pager, next"
        :current-page.sync="query.page"
        :page-size="query.pageSize"
        :total="total"
        @current-change="loadLogs" />
    </el-card>

    <el-dialog
      v-loading="detailLoading"
      title="审计详情"
      :visible.sync="detailVisible"
      width="720px"
      :close-on-click-modal="false">
      <el-descriptions v-if="selectedLog" :column="2" border size="small">
        <el-descriptions-item label="审计日志ID" labelClassName="detail-label" :span="2">
          {{ selectedLog.id }}
        </el-descriptions-item>
        <el-descriptions-item
          label="操作时间"
          labelClassName="detail-label"
          contentStyle="width:150px;">
          {{ formatDate(selectedLog.createdAt) }}
        </el-descriptions-item>
        <el-descriptions-item label="TraceID" labelClassName="detail-label">
          {{ selectedLog.traceId }}
        </el-descriptions-item>
        <el-descriptions-item label="状态码" labelClassName="detail-label">
          {{ selectedLog.statusCode }}
        </el-descriptions-item>
        <el-descriptions-item label="操作" labelClassName="detail-label">
          {{ actionLabel(selectedLog.action) }}
        </el-descriptions-item>
        <el-descriptions-item label="结果" labelClassName="detail-label">
          {{ selectedLog.result === 'SUCCESS' ? '成功' : '失败' }}
        </el-descriptions-item>
        <el-descriptions-item label="资源" labelClassName="detail-label">
          {{ selectedLog.resource }}
        </el-descriptions-item>
        <el-descriptions-item label="方法" labelClassName="detail-label">
          {{ selectedLog.method }}
        </el-descriptions-item>
        <el-descriptions-item label="请求路径" labelClassName="detail-label" :span="2">
          {{ selectedLog.path }}
        </el-descriptions-item>
        <el-descriptions-item label="操作人" labelClassName="detail-label">
          {{ actorLabel(selectedLog.actor) }}
        </el-descriptions-item>
        <el-descriptions-item label="用户标识" labelClassName="detail-label">
          {{ selectedLog.actor ? selectedLog.actor.userId : '系统操作' }}
        </el-descriptions-item>
        <el-descriptions-item label="来源IP" labelClassName="detail-label">
          {{ selectedLog.ip || '未知' }}
        </el-descriptions-item>
        <el-descriptions-item label="User-Agent" labelClassName="detail-label" :span="2">
          <span class="plain-text">
            {{ selectedLog.userAgent || '未知' }}
          </span>
        </el-descriptions-item>
        <el-descriptions-item label="请求参数" labelClassName="detail-label" :span="2">
          <pre class="detail-content">
            {{ formatRequestDetail(selectedLog.detail) }}
          </pre>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="
            selectedLog.detail && ('before' in selectedLog.detail || 'after' in selectedLog.detail)
          "
          label="变更前后"
          :span="2">
          <pre class="detail-content">{{
            formatDetail({
              before: selectedLog.detail.before,
              after: selectedLog.detail.after,
              reason: selectedLog.detail.reason,
            })
          }}</pre>
        </el-descriptions-item>
        <el-descriptions-item
          v-if="selectedLog.detail && selectedLog.detail.error"
          label="错误信息"
          labelClassName="detail-label"
          :span="2">
          <pre class="detail-content">
            {{ formatDetail(selectedLog.detail.error) }}
          </pre>
        </el-descriptions-item>
      </el-descriptions>
      <span slot="footer">
        <el-button @click="detailVisible = false">关闭</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import { getAuditLogDetail, getAuditLogs, exportAuditLogs } from '@/api/admin'
import { dateFormat } from '@/utils/date'

export default {
  name: 'SystemAudit',
  data() {
    return {
      loading: false,
      exporting: false,
      detailLoading: false,
      logs: [],
      total: 0,
      dateRange: [],
      detailVisible: false,
      selectedLog: null,
      query: {
        keyword: '',
        result: '',
        from: '',
        to: '',
        page: 1,
        pageSize: 20,
      },
    }
  },
  created() {
    this.loadLogs()
  },
  methods: {
    async exportLogs() {
      if (this.dateRange.length !== 2) {
        this.$message.warning('请先选择导出时间范围（最多 31 天、1000 条）')
        return
      }
      this.exporting = true
      try {
        const result = await exportAuditLogs({
          from: this.dateRange[0],
          to: this.dateRange[1],
          keyword: this.query.keyword || undefined,
          result: this.query.result || undefined,
        })
        const url = URL.createObjectURL(
          new Blob([result.content], { type: 'text/csv;charset=utf-8' })
        )
        const link = document.createElement('a')
        link.href = url
        link.download = result.filename
        link.click()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
      } finally {
        this.exporting = false
      }
    },
    formatDate(value) {
      return dateFormat(value) || '未知'
    },
    actionLabel(action) {
      const labels = {
        'audit.logs.list': '查询审计日志',
        'audit.logs.detail': '查看审计详情',
        'auth.login': '用户登录',
        'auth.logout': '用户退出登录',
        'auth.me': '查看登录信息',
        'auth.password.change': '修改登录密码',
        'auth.sessions.list': '查看登录会话',
        'auth.sessions.revoke': '撤销登录会话',
      }
      return labels[action] || action
    },
    actorLabel(actor) {
      if (!actor) return '系统操作'
      return actor.displayName ? `${actor.displayName} (${actor.username})` : actor.username
    },
    search() {
      this.query.page = 1
      this.loadLogs()
    },
    async loadLogs() {
      this.loading = true
      try {
        const params = {
          ...this.query,
          result: this.query.result || undefined,
          from: this.dateRange[0] || undefined,
          to: this.dateRange[1] || undefined,
        }
        const result = await getAuditLogs(params)
        this.logs = result.items || []
        this.total = result.total || 0
      } finally {
        this.loading = false
      }
    },
    async showDetail(log) {
      this.detailLoading = true
      try {
        this.selectedLog = await getAuditLogDetail(log.id)
        this.detailVisible = true
      } finally {
        this.detailLoading = false
      }
    },
    formatDetail(detail) {
      return detail ? JSON.stringify(this.sanitizeDetail(detail), null, 2) : '无'
    },
    formatRequestDetail(detail) {
      const request = detail && detail.request
      if (!request) return '无'
      const query = request.query && Object.keys(request.query).length ? request.query : null
      const body = request.body && Object.keys(request.body).length ? request.body : null
      return this.formatDetail(query || body || {})
    },
    sanitizeDetail(value, key = '') {
      const sensitive =
        /^(password|passwordHash|authorization|cookie|set-cookie|token|accessToken|refreshToken|captchaToken|sessionId|secret|signature)$/i
      if (sensitive.test(key)) return '[已隐藏]'
      if (Array.isArray(value)) return value.map((item) => this.sanitizeDetail(item))
      if (value && typeof value === 'object') {
        return Object.keys(value).reduce((result, name) => {
          result[name] = this.sanitizeDetail(value[name], name)
          return result
        }, {})
      }
      return value
    },
  },
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 20px;
}
.plain-text {
  word-break: break-all;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.toolbar .el-input {
  width: 220px;
}
.toolbar .el-select {
  width: 130px;
}
.toolbar .el-date-editor {
  width: 360px;
}
.pagination {
  margin-top: 16px;
  text-align: right;
}
.detail-content {
  max-height: 360px;
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
::v-deep {
  .detail-label {
    width: 85px;
  }
}
</style>
