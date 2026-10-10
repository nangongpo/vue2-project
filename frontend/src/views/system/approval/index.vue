<template>
  <div class="approval-page">
    <el-card shadow="never">
      <div class="approval-security-notice">
        <el-alert title="受控审批流程" description="申请 → 审批 → 执行 → 复核；申请人不得审批，复核人不得与前序阶段重复。提交前需在五分钟内完成 MFA 和重新认证。"
          type="info" :closable="false" show-icon />
      </div>
      <div class="toolbar">
        <el-select v-model="status" clearable placeholder="全部状态" @change="reset"><el-option
            v-for="statusOption in statusOptions" :key="statusOption.value" :label="statusOption.label" :value="statusOption.value" /></el-select>
        <permission-button permission="system.approval.read" :disabled="loading" @click="reset">刷新</permission-button>
        <el-button v-if="canCreate" type="primary" @click="openCreate">新建申请</el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-table v-loading="loading" :data="items" border stripe>
        <el-table-column label="申请编号" width="165">
          <template slot-scope="{ row }">{{ row.requestNo || row.id }}</template>
        </el-table-column>
        <el-table-column label="申请类型" width="120">
          <template slot-scope="{ row }">
            {{ row.kindLabel || '—' }}
          </template>
        </el-table-column>
        <el-table-column label="申请人" width="120">
          <template slot-scope="{ row }">
            {{ row.applicant?.displayName || '—' }}
          </template>
        </el-table-column>
        <el-table-column prop="reason" label="申请原因" min-width="200" />
        <el-table-column label="状态" width="140">
          <template slot-scope="{ row }">
            {{ row.statusLabel || '—' }}
            <el-tag v-if="row.deadlineStatus && row.deadlineStatus !== 'ACTIVE'" size="mini"
              type="info">{{ row.deadlineStatusLabel || '—' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="到期时间" min-width="155">
          <template slot-scope="{ row }">{{ formatDate(row.expiresAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="230"><template slot-scope="{ row }">
            <permission-button permission="system.approval.detail" type="text" @click="showDetail(row)">详情</permission-button>
            <permission-button :row="row" action="approve" type="text" :disabled="saving"
              @click="transition(row, 'approve')" />
            <permission-button :row="row" action="execute" type="text" :disabled="saving"
              @click="transition(row, 'execute')" />
            <permission-button :row="row" action="review" type="text" :disabled="saving"
              @click="transition(row, 'review')" />
            <permission-button :row="row" action="cancel" type="text" class="text-danger" :disabled="saving"
              @click="cancel(row)" />
          </template></el-table-column>
      </el-table>
      <div class="toolbar pagination">
        <el-button :disabled="!history.length || loading" @click="previous">上一页</el-button>
        <span>第 {{ history.length + 1 }}页</span>
        <el-button :disabled="!nextCursor || loading" @click="next">下一页</el-button>
      </div>
    </el-card>
    <el-dialog title="申请详情" :visible.sync="detailVisible" width="520px">
      <div v-loading="detailLoading" class="approval-detail-panel">
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-if="detail">
          <el-descriptions class="approval-detail" :column="1" border>
            <el-descriptions-item label="编号">{{ detail.requestNo || detail.id }}</el-descriptions-item>
            <el-descriptions-item label="类型 / 状态">
              {{ detail.kindLabel || '—' }} / {{ detail.statusLabel || '—' }}
              <el-tag v-if="detail.deadlineStatus && detail.deadlineStatus !== 'ACTIVE'" size="mini" type="info">
                {{ detail.deadlineStatusLabel || '—' }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="到期时间">{{ formatDate(detail.expiresAt) }}</el-descriptions-item>
            <el-descriptions-item v-for="stage in stages" :key="stage.actor" :label="stage.label">{{
              formatActor(detail[stage.actor]) }} · {{ formatDate(detail[stage.time]) }}
              <p v-if="detail[stage.note]">{{ detail[stage.note] }}</p>
            </el-descriptions-item>
          </el-descriptions>
          <el-collapse class="approval-payload-collapse">
            <el-collapse-item name="payload">
              <template slot="title">
                <span class="summary-title">请求参数</span>
                <span class="summary-hint">查看本次申请提交的参数</span>
              </template>
              <pre>{{ JSON.stringify(detail.payload, null, 2) }}</pre>
            </el-collapse-item>
          </el-collapse>
        </template>
        <div v-else-if="!detailError" class="approval-detail-placeholder">
          <i class="el-icon-loading"></i>
          <span>正在加载详情…</span>
        </div>
      </div>
    </el-dialog>
    <el-dialog title="新建审批申请" :visible.sync="createVisible" width="520px" :close-on-click-modal="false">
      <el-alert v-if="formError" class="approval-form-error" :title="targetRefError ? '' : formError" type="error" :closable="false" show-icon>
        <template v-if="targetRefError" slot="default">
          <span>{{ formError }}</span>
          <template v-if="targetRefError === 'BOTH'">
            <el-button type="text" class="retry-target-button" @click="retryTargetSelection('BOTH')">重新选择用户和角色</el-button>
          </template>
          <el-button v-else type="text" class="retry-target-button" @click="retryTargetSelection(targetRefError)">
            重新选择{{ targetRefError === 'USER' ? '用户' : '角色' }}
          </el-button>
        </template>
      </el-alert>
      <div v-if="!form.kind" class="approval-kind-selection">
        <div class="approval-kind-title">请选择申请类型</div>
        <div class="approval-kind-grid">
          <button v-for="kind in kinds" :key="kind.value" type="button" class="approval-kind-card"
            @click="selectKind(kind)">
            <span class="approval-kind-label">{{ kind.label }}</span>
            <span class="approval-kind-meta">最长 {{ kind.maxHours }} 小时</span>
          </button>
        </div>
        <el-empty v-if="!kinds.length" description="当前账号没有可创建的审批类型" :image-size="80" />
      </div>
      <template v-else>
        <div class="approval-kind-summary">
          <div>
            <span class="approval-kind-summary-label">申请类型</span>
            <strong>{{ kindMeta.label || '—' }}</strong>
          </div>
          <el-button type="text" @click="changeKind">更改申请类型</el-button>
        </div>
        <div v-if="hasKindField('MFA_WARNING')" class="approval-form-notice approval-form-top-notice">
          <el-alert title="用于管理员 MFA 丢失恢复。执行后需要重新登录并绑定 MFA。"
            type="warning" :closable="false" show-icon />
        </div>
      <component :is="kindFormComponent" v-if="kindFormComponent" :value="form" :kind-meta="kindMeta"
        :users="targetUsers" :roles="targetRoles" :loading="targetOptionsLoading" :methods="methods"
        :permissions="permissionOptions" :permission-loading="permissionOptionsLoading"
        :apis="apiOptions" :api-loading="apiOptionsLoading"
        :metadata="{ scopeTypeOptions: scopeTypes, targetTypeOptions: targetTypes, maxTargets: 200 }"
        @input="updateForm" @user-visible="targetVisible('USER', $event)"
        @role-visible="targetVisible('ROLE', $event)" @search-users="searchUsers"
        @search-roles="searchRoles" />
      </template>
      <span slot="footer"><el-button @click="createVisible = false">取消</el-button><el-button v-if="form.kind" type="primary"
          :disabled="!canCreate" :loading="saving" @click="submit">提交申请</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import {
  getApprovals,
  getApprovalTargetOptions,
  getApproval,
  createApproval,
  approveRequest,
  executeRequest,
  reviewRequest,
  cancelApprovalRequest,
  getRolePermissionOptions,
  getOperationApiOptions,
} from '@/api/admin'
import { approvalBody, buildApprovalPayload } from './utils'
import { requestReason } from '../permission/utils'
import { dateFormat } from '@/utils/date'
import { hasAvailableAction } from '@/utils/available-action'
import RoleGrantForm from './components/RoleGrantForm.vue'
import RoleRevokeForm from './components/RoleRevokeForm.vue'
import MfaResetForm from './components/MfaResetForm.vue'
import RoleStatusForm from './components/RoleStatusForm.vue'
import RolePermissionsForm from './components/RolePermissionsForm.vue'
import RolePermissionRevokeForm from './components/RolePermissionRevokeForm.vue'
import ApiRouteChangeForm from './components/ApiRouteChangeForm.vue'
import ElevatedScopeForm from './components/ElevatedScopeForm.vue'
import ElevatedRevokeForm from './components/ElevatedRevokeForm.vue'
const KIND_FORM_COMPONENTS = {
  ROLE_GRANT: RoleGrantForm,
  ROLE_REVOKE: RoleRevokeForm,
  MFA_RESET: MfaResetForm,
  ROLE_STATUS: RoleStatusForm,
  ROLE_PERMISSIONS: RolePermissionsForm,
  ROLE_PERMISSION_REVOKE: RolePermissionRevokeForm,
  API_ROUTE_CHANGE: ApiRouteChangeForm,
  ELEVATED_SCOPE: ElevatedScopeForm,
  ELEVATED_REVOKE: ElevatedRevokeForm,
}
const emptyForm = () => ({
  kind: '',
  userRef: '',
  roleRef: '',
  status: 'DISABLED',
  scopeId: '',
  permissionIds: [],
  apiId: '',
  code: '',
  method: 'GET',
  path: '',
  resource: '',
  scopeType: 'CUSTOM',
  targets: [],
  reason: '',
  expiresAt: null,
})
export default {
  name: 'SystemPermissionApproval',
  components: KIND_FORM_COMPONENTS,
  data() {
    return {
      kinds: [],
      methods: [],
      targetTypes: [],
      scopeTypes: [],
      statusOptions: [],
      items: [],
      status: '',
      cursor: undefined,
      nextCursor: null,
      history: [],
      loading: false,
      saving: false,
      error: '',
      requestId: 0,
      createVisible: false,
      form: emptyForm(),
      formError: '',
      targetUsers: [],
      targetRoles: [],
      targetOptionsLoading: false,
      targetRefError: '',
      permissionOptions: [],
      permissionOptionsLoading: false,
      apiOptions: [],
      apiOptionsLoading: false,
      detailVisible: false,
      detailLoading: false,
      detailError: '',
      detail: null,
      detailRequest: 0,
      stages: [
        { label: '申请人', actor: 'applicant', time: 'createdAt', note: 'reason' },
        { label: '审批人', actor: 'approver', time: 'approvedAt', note: 'approvalNote' },
        { label: '执行人', actor: 'executor', time: 'executedAt', note: 'executionNote' },
        { label: '复核人', actor: 'reviewer', time: 'reviewedAt', note: 'reviewNote' },
      ],
    }
  },
  computed: {
    canCreate() {
      return this.kinds.length > 0
    },
    kindMeta() {
      return this.kinds.find((item) => item.value === this.form.kind) || {}
    },
    kindFormComponent() {
      return KIND_FORM_COMPONENTS[this.form.kind] || null
    },
  },
  created() {
    this.load()
  },
  methods: {
    formatDate(value) {
      return dateFormat(value) || '—'
    },
    formatActor(actor) {
      if (!actor) return '未处理'
      return actor.displayName || actor.userId || '未知用户'
    },
    can(code) {
      return (this.$store.getters.menu_list || []).includes(code)
    },
    reset() {
      this.cursor = undefined
      this.history = []
      this.load()
    },
    next() {
      if (!this.nextCursor) return
      this.history.push(this.cursor)
      this.cursor = this.nextCursor
      this.load()
    },
    previous() {
      if (!this.history.length) return
      this.cursor = this.history.pop()
      this.load()
    },
    async load() {
      if (!this.can('system.approval.read')) {
        this.error = '缺少审批查询权限'
        return
      }
      const requestId = ++this.requestId
      this.loading = true
      this.error = ''
      try {
        const result = await getApprovals({ status: this.status || undefined, cursor: this.cursor })
        if (requestId === this.requestId) {
          this.items = result.items
          this.statusOptions = result.meta?.statusOptions || this.statusOptions
          this.kinds = result.meta?.kindOptions || this.kinds
          this.methods = result.meta?.httpMethodOptions || this.methods
          this.targetTypes = result.meta?.targetTypeOptions || this.targetTypes
          this.scopeTypes = result.meta?.scopeTypeOptions || this.scopeTypes
          if (!this.kinds.some((item) => item.value === this.form.kind)) this.form.kind = this.kinds[0]?.value || ''
          this.nextCursor = result.nextCursor
        }
      } catch (error) {
        if (requestId === this.requestId) {
          this.items = []
          this.nextCursor = null
          this.error = error.message || '审批列表加载失败'
        }
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    async showDetail(row) {
      const requestId = ++this.detailRequest
      this.detailVisible = true
      this.detailLoading = true
      this.detailError = ''
      this.detail = null
      try {
        const detail = await getApproval(row.id)
        if (requestId === this.detailRequest) this.detail = detail
      } catch (error) {
        if (requestId === this.detailRequest) this.detailError = error.message || '详情加载失败'
      } finally {
        if (requestId === this.detailRequest) this.detailLoading = false
      }
    },
    openCreate() {
      this.form = emptyForm()
      this.formError = ''
      this.targetRefError = ''
      this.permissionOptions = []
      this.apiOptions = []
      this.createVisible = true
    },
    selectKind(kind) {
      this.form = emptyForm()
      this.form.kind = kind.value
      this.formError = ''
      this.targetRefError = ''
      this.permissionOptions = []
      if (this.hasKindField('PERMISSIONS')) this.loadPermissionOptions()
      this.apiOptions = []
      if (this.form.kind === 'API_ROUTE_CHANGE') this.loadApiOptions()
    },
    hasKindField(field) {
      return this.kindMeta.fields?.includes(field) || false
    },
    updateForm(value) {
      this.form = { ...this.form, ...value }
    },
    changeKind() {
      this.form = emptyForm()
      this.resetTargetOptions()
      this.formError = ''
      this.permissionOptions = []
      this.apiOptions = []
    },
    targetVisible(targetType, visible) {
      if (!visible || this.targetOptionsLoading) return
      const options = targetType === 'USER' ? this.targetUsers : this.targetRoles
      if (!options.length) this.fetchTargetOptions(targetType, '')
    },
    resetTargetOptions() {
      this.form.userRef = ''
      this.form.roleRef = ''
      this.targetUsers = []
      this.targetRoles = []
      this.targetRefError = ''
    },
    searchUsers(keyword) {
      if (this.targetOptionsLoading) return
      this.fetchTargetOptions('USER', keyword || '')
    },
    searchRoles(keyword) {
      if (this.targetOptionsLoading) return
      this.fetchTargetOptions('ROLE', keyword || '')
    },
    async fetchTargetOptions(targetType, keyword) {
      this.targetOptionsLoading = true
      if (targetType === 'USER') this.targetRefError = this.targetRefError === 'USER' ? '' : this.targetRefError
      if (targetType === 'ROLE') this.targetRefError = this.targetRefError === 'ROLE' ? '' : this.targetRefError
      try {
        const result = await getApprovalTargetOptions({ kind: this.form.kind, targetType, keyword })
        if (targetType === 'USER') this.targetUsers = result.items || []
        else this.targetRoles = result.items || []
      } catch (error) {
        this.formError = error.message || '目标加载失败'
      } finally {
        this.targetOptionsLoading = false
      }
    },
    async loadPermissionOptions() {
      this.permissionOptionsLoading = true
      try {
        const result = await getRolePermissionOptions()
        this.permissionOptions = (result || []).filter((item) => item.isActive && item.id && item.code)
      } catch (error) {
        this.formError = error.message || '权限选项加载失败'
      } finally {
        this.permissionOptionsLoading = false
      }
    },
    async loadApiOptions() {
      this.apiOptionsLoading = true
      try {
        const result = await getOperationApiOptions()
        this.apiOptions = (result || []).filter((item) => item.id && item.code && item.isActive !== false)
      } catch (error) {
        this.formError = error.message || '接口选项加载失败'
      } finally {
        this.apiOptionsLoading = false
      }
    },
    retryTargetSelection(targetType) {
      if (!targetType) return
      if (targetType === 'USER' || targetType === 'BOTH') {
        this.form.userRef = ''
        this.targetUsers = []
      }
      if (targetType === 'ROLE' || targetType === 'BOTH') {
        this.form.roleRef = ''
        this.targetRoles = []
      }
      this.formError = ''
      this.targetRefError = ''
      this.$nextTick(() => {
        this.fetchTargetOptions(targetType === 'BOTH' ? 'USER' : targetType, '')
      })
    },
    targetRefType(body) {
      const payload = body?.payload || {}
      if (payload.userRef && payload.roleRef) return 'BOTH'
      if (payload.userRef) return 'USER'
      if (payload.roleRef) return 'ROLE'
      return ''
    },
    async submit() {
      if (this.saving || !this.canCreate) return
      const metadata = {
        kindMeta: this.kindMeta,
        httpMethodOptions: this.methods,
        targetTypeOptions: this.targetTypes,
        scopeTypeOptions: this.scopeTypes,
      }
      let body
      try {
        body = approvalBody({ ...this.form, payload: buildApprovalPayload(this.form, metadata) }, metadata)
      } catch (error) {
        this.formError = error.message
        return
      }
      const confirmed = await this.$confirm(
        '确认提交“' + (this.kindMeta.label || body.kind) + '”申请？到期时间：' + new Date(body.expiresAt).toLocaleString(),
        '提交审批',
        { type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!confirmed) return
      this.saving = true
      this.formError = ''
      try {
        await createApproval(body)
        this.createVisible = false
        this.$message.success('申请已提交，等待独立审批')
        this.reset()
      } catch (error) {
        const message = error.message || '提交失败，请重新认证后重试'
        if (/审批目标引用无效|已过期|已使用|重新选择/.test(message)) {
          this.targetRefError = this.targetRefType(body)
          this.formError = '目标已失效，请重新选择后再提交。'
        } else {
          this.formError = message
        }
      } finally {
        this.saving = false
      }
    },
    async transition(row, action) {
      if (this.saving || !hasAvailableAction(row, action)) return
      const note = await requestReason(
        this,
        { approve: '审批通过', execute: '执行变更', review: '审计复核' }[action],
        '申请 ' + (row.requestNo || row.id) + '：' + row.reason + '。请填写处理意见。'
      )
      if (!note) return
      this.saving = true
      try {
        await { approve: approveRequest, execute: executeRequest, review: reviewRequest }[action](
          row.id,
          note
        )
        this.$message.success('处理成功')
        await this.load()
      } catch (error) {
        if (error.status === 409) await this.load()
        this.error = error.message || '处理失败，请刷新并核实状态'
      } finally {
        this.saving = false
      }
    },
    async cancel(row) {
      if (this.saving || !hasAvailableAction(row, 'cancel')) return
      const note = await requestReason(
        this,
        '撤回审批申请',
        '申请 ' + (row.requestNo || row.id) + ' 将被撤回，撤回后不能继续审批。请填写撤回原因。'
      )
      if (!note) return
      this.saving = true
      try {
        await cancelApprovalRequest(row.id, note)
        this.$message.success('审批申请已撤回')
        await this.load()
      } catch (error) {
        if (error.status === 409) await this.load()
        this.error = error.message || '撤回失败，请刷新并核实状态'
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.approval-page {
  padding: 20px;
}

.approval-security-notice {
  margin-bottom: 16px;
}

.approval-security-notice .el-alert {
  margin-bottom: 0;
}

.approval-form-error,
.approval-form-notice {
  margin-bottom: 16px;
}

.approval-form-error {
  min-height: 40px;
}

.approval-detail-panel {
  min-height: 450px;
}

.approval-detail-placeholder {
  display: flex;
  min-height: 450px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #909399;
}

.summary-title {
  color: #303133;
  font-weight: 600;
}

.summary-hint {
  margin-left: 12px;
  color: #909399;
  font-size: 12px;
}

.approval-payload-collapse {
  margin-top: 12px;
  margin-bottom: 16px;
  border-top: 0;
  border-bottom: 0;
}

.approval-payload-collapse >>> .el-collapse-item__header {
  height: 36px;
  padding: 0 4px;
  border-top: 0;
  border-bottom: 0;
  line-height: 36px;
}

.approval-payload-collapse >>> .el-collapse-item__wrap {
  border-bottom: 0;
}

.approval-payload-collapse >>> .el-collapse-item__content {
  padding: 4px 0 0;
}

.approval-payload-collapse pre {
  margin: 0;
  padding: 8px 12px;
}

.approval-kind-selection {
  min-height: 300px;
  padding: 8px 4px 20px;
}

.approval-kind-title {
  margin-bottom: 16px;
  color: #303133;
  font-size: 15px;
  font-weight: 600;
}

.approval-kind-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.approval-kind-card {
  display: flex;
  min-height: 76px;
  padding: 15px 16px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #fff;
  color: #303133;
  cursor: pointer;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  transition: border-color 0.2s, background-color 0.2s;
}

.approval-kind-card:hover,
.approval-kind-card:focus {
  border-color: #409eff;
  background: #f5f9ff;
  outline: none;
}

.approval-kind-label {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.approval-kind-meta {
  margin-top: 6px;
  color: #909399;
  font-size: 12px;
}

.approval-kind-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 42px;
  margin-bottom: 16px;
  padding: 8px 12px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #f8fafc;
}

.approval-kind-summary-label {
  margin-right: 12px;
  color: #909399;
  font-size: 13px;
}

.approval-form-notice .el-alert {
  margin-bottom: 0;
}

::v-deep .approval-detail .el-descriptions-item__label {
  width: 90px;
}

.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 16px 0;
}

.pagination {
  justify-content: flex-end;
}

.el-alert {
  margin-bottom: 16px;
}

pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #f5f7fa;
  padding: 16px;
}
</style>
