<template>
  <section class="scan-history" v-loading="loading">
    <el-alert v-if="error" class="history-error" :title="error" type="error" :closable="false" />
    <div class="section-heading">
      <h4>扫描任务</h4><span class="secondary">{{ total }} 条</span>
    </div>
    <el-table :data="jobs" border size="mini" row-key="id" highlight-current-row :current-row-key="selected && selected.id" empty-text="暂无扫描任务">
      <el-table-column label="创建时间" min-width="160"><template slot-scope="{ row }">{{ date(row.createdAt) }}</template></el-table-column>
      <el-table-column label="状态" width="110"><template slot-scope="{ row }"><el-tag size="mini" :type="row.statusTone || 'info'">{{ row.statusLabel || '—' }}</el-tag></template></el-table-column>
      <el-table-column prop="attemptCount" label="执行次数" width="85" align="center" />
      <el-table-column label="操作" min-width="120" align="right"><template slot-scope="{ row }">
        <span v-if="row.historyAvailable === false" class="secondary legacy-label">旧记录</span>
        <permission-button :permission="['system.file.admin.scan-history.detail', 'system.file.admin.scan-history.attempts']" type="text" @click="select(row)">{{ selected && selected.id === row.id ? '当前任务' : '查看' }}</permission-button>
      </template></el-table-column>
    </el-table>
    <el-pagination class="history-pagination" small :current-page="page" :page-size="10" :total="total" layout="prev, pager, next" @current-change="changePage" />

    <div v-if="selected" v-loading="detailLoading" class="scan-records">
      <div class="section-heading">
        <h4>执行记录</h4><span class="secondary">{{ attemptTotal }} 条</span>
        <span v-if="selected.historyAvailable === false" class="legacy-notice">历史记录不完整</span>
      </div>
      <details class="task-meta">
        <summary>任务信息</summary>
        <dl class="metadata-grid">
          <dt>任务 ID</dt><dd>{{ selected.id }}</dd>
          <dt>SHA-256</dt><dd class="hash-value">{{ selected.sha256 || '未记录' }}</dd>
          <dt>文件大小</dt><dd>{{ selected.size == null ? '未记录' : selected.size + ' B' }}</dd>
          <dt>开始 / 结束</dt><dd>{{ date(selected.startedAt) }} / {{ date(selected.finishedAt) }}</dd>
        </dl>
        <div v-for="(trigger, index) in selected.triggers || []" :key="index" class="trigger-row">
          <div class="trigger-heading">
            <strong>{{ trigger.sourceLabel || '—' }}</strong>
            <span class="secondary">{{ date(trigger.createdAt) }}</span>
            <el-tag v-if="trigger.reused" type="info" size="mini">复用任务</el-tag>
          </div>
          <dl class="metadata-grid">
            <dt>申请 / 执行</dt><dd>{{ trigger.requestedByName || '—' }} / {{ trigger.executedByName || '—' }}</dd>
            <template v-if="trigger.reason"><dt>原因</dt><dd>{{ trigger.reason }}</dd></template>
            <template v-if="trigger.approvalId"><dt>审批 ID</dt><dd>{{ trigger.approvalId }}</dd></template>
          </dl>
        </div>
      </details>
      <el-table :data="attempts" border size="mini" empty-text="暂无执行记录">
        <el-table-column prop="attemptNo" label="次数" width="55" align="center" />
        <el-table-column label="状态 / 阶段" width="105"><template slot-scope="{ row }">
          <span>{{ row.statusLabel || '—' }}</span><span class="cell-secondary">{{ row.stageLabel || '—' }}</span>
        </template></el-table-column>
        <el-table-column label="扫描结论" width="90"><template slot-scope="{ row }">{{ row.verdictLabel || '未获取' }}</template></el-table-column>
        <el-table-column label="引擎 / 策略" min-width="150"><template slot-scope="{ row }">
          <span>{{ row.scanEngineVersion || '未获取' }}</span><span class="cell-secondary">{{ row.policyVersion || '未获取' }}</span>
        </template></el-table-column>
        <el-table-column label="执行时间" min-width="175"><template slot-scope="{ row }">
          <span>{{ date(row.startedAt) }}</span><span class="cell-secondary">{{ date(row.finishedAt) }}</span>
          <span v-if="row.durationMs != null" class="cell-secondary">{{ row.durationMs }} ms</span>
        </template></el-table-column>
        <el-table-column label="结果说明" min-width="160"><template slot-scope="{ row }">
          <span>{{ row.errorMessage || row.scanDetail || '—' }}</span>
          <span v-if="row.errorMessage && row.scanDetail" class="cell-secondary">{{ row.scanDetail }}</span>
          <span v-if="row.errorCode" class="cell-secondary">{{ row.errorCode }}</span>
        </template></el-table-column>
      </el-table>
      <el-pagination class="history-pagination" small :current-page="attemptPage" :page-size="10" :total="attemptTotal" layout="prev, pager, next" @current-change="changeAttemptPage" />
    </div>
  </section>
</template>
<script>
import { getFileScanJobs, getFileScanJob, getFileScanAttempts } from '@/api/file-management'
import { dateFormat } from '@/utils/date'
export default {
  name: 'FileScanHistory',
  props: { fileId: { type: String, required: true }, approvalId: { type: String, default: '' } },
  data() { return { jobs: [], total: 0, page: 1, selected: null, attempts: [], attemptTotal: 0, attemptPage: 1, loading: false, detailLoading: false, error: '', timer: null, generation: 0, detailGeneration: 0 } },
  mounted() { document.addEventListener('visibilitychange', this.visibility); this.refresh() },
  beforeDestroy() { this.generation++; this.detailGeneration++; clearTimeout(this.timer); document.removeEventListener('visibilitychange', this.visibility) },
  watch: { fileId() { this.reset() }, approvalId() { this.reset() } },
  methods: {
    date(value) { return value ? dateFormat(value) : '—' },
    reset() { this.generation++; this.detailGeneration++; this.jobs = []; this.selected = null; this.attempts = []; this.page = 1; this.refresh() },
    visibility() { clearTimeout(this.timer); if (!document.hidden) this.refresh() },
    changePage(page) { this.page = page; this.refresh() },
    changeAttemptPage(page) { this.attemptPage = page; this.loadSelected() },
    async select(job) { this.selected = job; this.attempts = []; this.attemptPage = 1; await this.loadSelected(); this.schedule() },
    schedule() {
      clearTimeout(this.timer)
      if (!document.hidden && (this.jobs.some((job) => job.isTerminal === false) || this.selected?.isTerminal === false)) this.timer = setTimeout(this.refresh, 5000)
    },
    async refresh() {
      clearTimeout(this.timer)
      const generation = ++this.generation
      this.loading = true
      try {
        const result = await getFileScanJobs(this.fileId, { page: this.page, pageSize: 10, ...(this.approvalId ? { approvalId: this.approvalId } : {}) })
        if (generation !== this.generation) return
        this.jobs = result.items || []; this.total = result.total || 0; this.error = ''
        if (this.selected) await this.loadSelected()
        this.schedule()
      } catch (error) { if (generation === this.generation) this.error = error.message || '扫描历史加载失败' }
      finally { if (generation === this.generation) this.loading = false }
    },
    async loadSelected() {
      if (!this.selected) return
      const generation = ++this.detailGeneration
      const jobId = this.selected.id
      this.detailLoading = true
      try {
        const [detail, result] = await Promise.all([getFileScanJob(this.fileId, jobId), getFileScanAttempts(this.fileId, jobId, { page: this.attemptPage, pageSize: 10 })])
        if (generation !== this.detailGeneration) return
        this.selected = detail; this.attempts = result.items || []; this.attemptTotal = result.total || 0
      } catch (error) { if (generation === this.detailGeneration) this.error = error.message || '执行记录加载失败' }
      finally { if (generation === this.detailGeneration) this.detailLoading = false }
    },
  },
}
</script>
<style scoped>
.scan-history { min-width: 0; }
.history-error { margin-bottom: 12px; }
.section-heading { display: flex; align-items: center; gap: 8px; min-height: 24px; margin-bottom: 8px; }
.section-heading h4 { margin: 0; color: #303133; font-size: 14px; font-weight: 600; }
.secondary, .cell-secondary { color: #909399; font-size: 12px; }
.cell-secondary { display: block; overflow-wrap: anywhere; line-height: 18px; }
.legacy-label { margin-right: 8px; }
.legacy-notice { margin-left: auto; color: #909399; font-size: 12px; }
.history-pagination { margin-top: 8px; padding: 0; text-align: right; }
.scan-records { margin-top: 20px; }
.task-meta { margin-bottom: 10px; border: 1px solid #ebeef5; border-radius: 4px; background: #fafbfc; }
.task-meta summary { padding: 8px 12px; color: #606266; font-size: 12px; cursor: pointer; }
.task-meta summary:focus-visible { outline: 2px solid #409eff; outline-offset: -2px; }
.metadata-grid { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 5px 12px; margin: 0; padding: 0 12px 10px; font-size: 12px; line-height: 20px; }
.metadata-grid dt { color: #909399; }
.metadata-grid dd { min-width: 0; margin: 0; color: #606266; overflow-wrap: anywhere; }
.hash-value { font-family: monospace; word-break: break-all; }
.trigger-row { padding-top: 10px; border-top: 1px solid #ebeef5; }
.trigger-heading { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 0 12px 6px; font-size: 12px; }
.trigger-heading strong { color: #606266; font-weight: 500; }
::v-deep .el-table th, ::v-deep .el-table td { padding: 6px 0; }
::v-deep .el-table th { background: #f7f8fa; }
::v-deep .el-table .cell { padding: 0 10px; line-height: 20px; }
::v-deep .el-table .el-button--text { padding: 2px 0; }
</style>
