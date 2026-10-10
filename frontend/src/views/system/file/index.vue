<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="query.keyword"
          clearable
          placeholder="文件名 / SHA-256"
          @keyup.enter.native="search" />
        <el-select v-model="query.status" clearable placeholder="文件状态">
          <el-option v-for="item in statusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-select v-model="query.scanStatus" clearable placeholder="扫描状态">
          <el-option v-for="item in scanStatusOptions" :key="item.value" :label="item.label" :value="item.value" />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
      </div>

      <el-alert
        title="文件只有通过安全扫描后才允许业务使用；系统管理员操作会被记录并纳入审计。"
        type="info"
        :closable="false"
        show-icon
        class="security-tip" />

      <el-table v-loading="loading" :data="files" border stripe>
        <el-table-column label="文件名" min-width="220">
          <template slot-scope="scope">
            <span class="file-name">{{ scope.row.safeName || scope.row.originalName }}</span>
            <small v-if="scope.row.originalName !== scope.row.safeName">原名：{{ scope.row.originalName }}</small>
          </template>
        </el-table-column>
        <el-table-column label="大小" width="110">
          <template slot-scope="scope">{{ formatSize(scope.row.size) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template slot-scope="scope">
            <el-tag :type="scope.row.statusTone || 'info'">{{ scope.row.statusLabel || '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="扫描" width="110">
          <template slot-scope="scope">
            <el-tag :type="scope.row.scanStatusTone || 'info'">{{ scope.row.scanStatusLabel || '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="上传人" min-width="150">
          <template slot-scope="scope">{{ ownerLabel(scope.row.owner) }}</template>
        </el-table-column>
        <el-table-column label="业务关联" min-width="180">
          <template slot-scope="scope">
            <span v-if="scope.row.bindings && scope.row.bindings.length">
              {{ bindingLabel(scope.row.bindings[0]) }}<span v-if="scope.row.bindings.length > 1"> 等 {{ scope.row.bindings.length }} 项</span>
            </span>
            <span v-else class="muted">未关联</span>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" width="170">
          <template slot-scope="scope">{{ formatDate(scope.row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="260" fixed="right">
          <template slot-scope="scope">
            <permission-button permission="system.file.admin.detail" type="text" @click="showDetail(scope.row)">详情</permission-button>
            <permission-button :row="scope.row" action="rescan" type="text" @click="rescan(scope.row)" />
            <permission-button :row="scope.row" action="reject" type="text" @click="reject(scope.row)" />
            <permission-button :row="scope.row" action="delete" type="text" class="danger-text" @click="remove(scope.row)" />
            <permission-button :row="scope.row" action="restore" type="text" @click="restore(scope.row)" />
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
        @current-change="loadFiles" />
    </el-card>

    <el-dialog title="文件详情" :visible.sync="detailVisible" width="760px" :close-on-click-modal="false">
      <el-descriptions v-if="selectedFile" :column="2" border size="small">
        <el-descriptions-item label="文件 ID" :span="2">{{ selectedFile.id }}</el-descriptions-item>
        <el-descriptions-item label="展示名称">{{ selectedFile.safeName }}</el-descriptions-item>
        <el-descriptions-item label="原始名称">{{ selectedFile.originalName }}</el-descriptions-item>
        <el-descriptions-item label="大小">{{ formatSize(selectedFile.size) }}</el-descriptions-item>
        <el-descriptions-item label="声明类型">{{ selectedFile.declaredMime || '—' }}</el-descriptions-item>
        <el-descriptions-item label="检测类型">{{ selectedFile.detectedMime || '未检测' }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ selectedFile.classification || 'INTERNAL' }}</el-descriptions-item>
        <el-descriptions-item label="SHA-256" :span="2"><span class="hash">{{ selectedFile.sha256 || '未生成' }}</span></el-descriptions-item>
        <el-descriptions-item label="扫描引擎">{{ selectedFile.scanEngineVersion || '—' }}</el-descriptions-item>
        <el-descriptions-item label="策略版本">{{ selectedFile.policyVersion || '—' }}</el-descriptions-item>
        <el-descriptions-item label="扫描说明" :span="2">{{ selectedFile.scanDetail || '—' }}</el-descriptions-item>
      </el-descriptions>
      <div v-if="selectedFile && selectedFile.bindings && selectedFile.bindings.length" class="binding-list">
        <h4>业务关联</h4>
        <div v-for="binding in selectedFile.bindings" :key="binding.id" class="binding-item">
          {{ bindingLabel(binding) }} / {{ binding.visibility }}
        </div>
      </div>
      <span slot="footer"><el-button @click="detailVisible = false">关闭</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import {
  deleteManagedFile,
  getManagedFile,
  getManagedFiles,
  rejectManagedFile,
  rescanManagedFile,
  restoreManagedFile,
} from '@/api/file-management'
import { dateFormat } from '@/utils/date'

export default {
  name: 'SystemFileManagement',
  data() {
    return {
      loading: false,
      files: [],
      total: 0,
      detailVisible: false,
      selectedFile: null,
      statusOptions: [],
      scanStatusOptions: [],
      query: { keyword: '', status: '', scanStatus: '', page: 1, pageSize: 10 },
    }
  },
  created() { this.loadFiles() },
  methods: {
    async loadFiles() {
      this.loading = true
      try {
        const result = await getManagedFiles(this.query)
        this.files = result.items || []
        this.total = result.total || 0
        this.statusOptions = result.meta?.statusOptions || this.statusOptions
        this.scanStatusOptions = result.meta?.scanStatusOptions || this.scanStatusOptions
      } catch (error) {
        this.files = []
        this.total = 0
        this.$message.error(error.message || '文件列表加载失败')
      } finally { this.loading = false }
    },
    search() { this.query.page = 1; this.loadFiles() },
    async showDetail(file) {
      try {
        this.selectedFile = await getManagedFile(file.id)
        this.detailVisible = true
      } catch (error) { this.$message.error(error.message || '文件详情加载失败') }
    },
    async rescan(file) {
      const reason = await this.reason('重新扫描文件', '重新扫描将重新调用病毒扫描服务，请填写原因。')
      if (!reason) return
      try { await rescanManagedFile(file.id, reason); this.$message.success('已提交重新扫描审批，请到授权审批页面继续处理'); await this.loadFiles() } catch (error) { this.$message.error(error.message || '提交重新扫描审批失败') }
    },
    async reject(file) {
      const reason = await this.reason('拒绝文件', '文件将被标记为违规并禁止业务使用，请填写原因。')
      if (!reason) return
      try { await rejectManagedFile(file.id, reason); this.$message.success('已提交文件拒绝审批，请到授权审批页面继续处理'); await this.loadFiles() } catch (error) { this.$message.error(error.message || '提交文件拒绝审批失败') }
    },
    async remove(file) {
      const reason = await this.reason('删除文件', '删除采用逻辑删除并进入后续生命周期清理，请填写原因。')
      if (!reason) return
      try { await deleteManagedFile(file.id, reason); this.$message.success('已提交文件删除审批，请到授权审批页面继续处理'); await this.loadFiles() } catch (error) { this.$message.error(error.message || '提交文件删除审批失败') }
    },
    async restore(file) {
      const reason = await this.reason('恢复文件', '恢复后文件仍需重新扫描，扫描通过前不能使用。')
      if (!reason) return
      try { await restoreManagedFile(file.id, reason); this.$message.success('已提交文件恢复审批，请到授权审批页面继续处理'); await this.loadFiles() } catch (error) { this.$message.error(error.message || '提交文件恢复审批失败') }
    },
    reason(title, message) {
      return this.$prompt(message, title, { inputPlaceholder: '请输入操作原因', inputValidator: (value) => value && value.trim() ? true : '操作原因不能为空' }).then((result) => result.value.trim()).catch(() => '')
    },
    formatDate(value) { return dateFormat(value) },
    formatSize(value) {
      const size = Number(value || 0)
      if (size < 1024) return `${size} B`
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
      if (size < 1024 * 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`
      return `${(size / 1024 / 1024 / 1024).toFixed(2)} GB`
    },
    ownerLabel(owner) { return owner ? `${owner.displayName} (${owner.username})` : '—' },
    bindingLabel(binding) { return `${binding.resourceType}:${binding.resourceId}${binding.fieldName ? ` / ${binding.fieldName}` : ''}` },
  },
}
</script>

<style lang="scss" scoped>
.page-container { padding: 20px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; }
.toolbar .el-input { width: 260px; }
.toolbar .el-select { width: 150px; }
.security-tip { margin-bottom: 16px; }
.pagination { margin-top: 16px; text-align: right; }
.file-name { display: block; word-break: break-all; }
.file-name + small { display: block; color: #909399; margin-top: 3px; }
.muted { color: #909399; }
.danger-text { color: #f56c6c; }
.hash { word-break: break-all; font-family: monospace; }
.binding-list { margin-top: 20px; }
.binding-list h4 { margin: 0 0 8px; }
.binding-item { padding: 6px 0; border-bottom: 1px solid #ebeef5; }
</style>
