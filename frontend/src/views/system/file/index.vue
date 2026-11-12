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
        <el-table-column label="操作" width="330" fixed="right">
          <template slot-scope="scope">
            <permission-button permission="system.file.admin.detail" type="text" @click="showDetail(scope.row)">详情</permission-button>
            <permission-button permission="system.file.admin.scan-history.read" type="text" @click="showHistory(scope.row)">扫描历史</permission-button>
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

    <el-dialog title="文件详情" :visible.sync="detailVisible" width="760px" custom-class="file-detail-dialog" :close-on-click-modal="false">
      <el-descriptions v-if="selectedFile" :column="2" border size="small">
        <el-descriptions-item label="文件 ID" :span="2">{{ selectedFile.id }}</el-descriptions-item>
        <el-descriptions-item label="展示名称">{{ selectedFile.safeName }}</el-descriptions-item>
        <el-descriptions-item label="原始名称">{{ selectedFile.originalName }}</el-descriptions-item>
        <el-descriptions-item label="大小">{{ formatSize(selectedFile.size) }}</el-descriptions-item>
        <el-descriptions-item label="声明类型">{{ selectedFile.declaredMime || '—' }}</el-descriptions-item>
        <el-descriptions-item label="检测类型">{{ selectedFile.detectedMime || '未检测' }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ selectedFile.classificationLabel || '—' }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ selectedFile.createdAt ? formatDate(selectedFile.createdAt) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ selectedFile.updatedAt ? formatDate(selectedFile.updatedAt) : '—' }}</el-descriptions-item>
        <el-descriptions-item label="SHA-256" :span="2"><span class="hash">{{ selectedFile.sha256 || '未生成' }}</span></el-descriptions-item>
        <el-descriptions-item label="扫描引擎版本">{{ selectedFile.scanEngineVersion || '—' }}</el-descriptions-item>
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
    <el-dialog :title="actionTitle" :visible.sync="actionVisible" width="520px" :close-on-click-modal="false" :close-on-press-escape="!actionBusy" :show-close="!actionBusy">
      <el-form label-position="top">
        <el-form-item label="操作原因" required>
          <el-input v-model="actionReason" type="textarea" :rows="3" maxlength="255" show-word-limit :disabled="actionBusy" />
        </el-form-item>
        <template v-if="actionType === 'rescan' || actionType === 'restore'">
          <el-checkbox v-model="releaseRequested" :disabled="actionBusy">同时申请解除安全封禁（需独立审批）</el-checkbox>
          <el-form-item v-if="releaseRequested" label="安全解除依据" required>
            <el-input v-model="releaseReason" type="textarea" :rows="3" maxlength="255" placeholder="填写调查结论与解除依据；扫描通过后才可恢复使用" :disabled="actionBusy" />
          </el-form-item>
        </template>
      </el-form>
      <span slot="footer">
        <el-button :disabled="actionBusy" @click="actionVisible = false">取消</el-button>
        <el-button type="primary" :loading="actionBusy" @click="submitAction">提交</el-button>
      </span>
    </el-dialog>
    <el-drawer
      title="扫描历史"
      :visible.sync="historyVisible"
      size="900px"
      custom-class="file-history-drawer"
      :wrapper-closable="false">
      <div class="history-content">
        <h3 v-if="historyFile" class="history-file-name">{{ historyFile.safeName || historyFile.originalName }}</h3>
        <file-scan-history v-if="historyVisible && historyFile && canReadHistory" :key="historyFile.id" :file-id="historyFile.id" />
      </div>
    </el-drawer>
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
import FileScanHistory from '@/components/FileScanHistory.vue'
import { dateFormat } from '@/utils/date'

export default {
  name: 'SystemFileManagement',
  components: { FileScanHistory },
  computed: { canReadHistory() { return this.$store.getters.menu_list.includes('system.file.admin.scan-history.read') } },
  data() {
    return {
      loading: false,
      actionVisible: false, actionBusy: false, actionType: '', actionTitle: '', actionFile: null,
      actionReason: '', releaseRequested: false, releaseReason: '',
      files: [],
      total: 0,
      detailVisible: false,
      selectedFile: null,
      historyVisible: false,
      historyFile: null,
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
    showHistory(file) { this.historyFile = file; this.historyVisible = true },
    async showDetail(file) {
      try {
        this.selectedFile = await getManagedFile(file.id)
        this.detailVisible = true
      } catch (error) { this.$message.error(error.message || '文件详情加载失败') }
    },
    openAction(file, type, title) {
      this.actionFile = file
      this.actionType = type
      this.actionTitle = title
      this.actionReason = ''
      this.releaseRequested = false
      this.releaseReason = ''
      this.actionVisible = true
    },
    rescan(file) { this.openAction(file, 'rescan', '重新扫描文件') },
    reject(file) { this.openAction(file, 'reject', '拒绝文件') },
    remove(file) { this.openAction(file, 'delete', '删除文件') },
    restore(file) { this.openAction(file, 'restore', '恢复文件') },
    async submitAction() {
      if (this.actionBusy || !this.actionFile) return
      if (!this.actionReason.trim()) return this.$message.warning('请填写操作原因')
      if (this.releaseRequested && !this.releaseReason.trim()) return this.$message.warning('请填写安全解除依据')
      const actions = { rescan: rescanManagedFile, reject: rejectManagedFile, delete: deleteManagedFile, restore: restoreManagedFile }
      this.actionBusy = true
      try {
        const result = await actions[this.actionType](this.actionFile.id, this.actionReason.trim(),
          this.releaseRequested ? this.releaseReason.trim() : undefined)
        if (result.status === 'PENDING_APPROVAL') this.$message.success('已提交审批，请到授权审批页面继续处理')
        else this.$message.success(this.actionType === 'rescan' || this.actionType === 'restore' ? '操作已执行，等待安全扫描结果' : '操作已执行')
        this.actionVisible = false
        await this.loadFiles()
      } catch (error) { this.$message.error(error.message || '文件操作失败') }
      finally { this.actionBusy = false }
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
::v-deep .file-detail-dialog { max-width: calc(100vw - 32px); }
::v-deep .file-history-drawer { max-width: calc(100vw - 32px); }
::v-deep .file-history-drawer .el-drawer__header { margin-bottom: 0; padding: 18px 20px; border-bottom: 1px solid #ebeef5; color: #303133; }
.history-content { padding: 16px 20px 20px; }
.history-file-name { margin: 0 0 20px; font-size: 20px; font-weight: 600; line-height: 1.5; color: #303133; overflow-wrap: anywhere; }
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
