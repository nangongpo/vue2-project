<template>
  <div class="approval-page">
    <el-card shadow="never">
      <el-alert
        title="申请 → 审批 → 执行 → 审计复核。申请人不能审批，审计复核人须独立于前三阶段。"
        type="info"
        :closable="false" />
      <p>
        所有提交操作要求五分钟内完成 MFA 和重新认证。<router-link to="/system/session"
          >前往账号安全验证</router-link
        >
      </p>
      <div class="toolbar">
        <el-select v-model="status" clearable placeholder="全部状态" @change="reset"
          ><el-option v-for="(label, value) in statuses" :key="value" :label="label" :value="value"
        /></el-select>
        <el-button v-permission="'system.approval.read'" :disabled="loading" @click="reset"
          >刷新</el-button
        >
        <el-button v-if="canCreate" type="primary" @click="openCreate">新建申请</el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-table v-loading="loading" :data="items" border stripe>
        <el-table-column prop="id" label="申请编号" min-width="230" />
        <el-table-column label="申请类型" min-width="140"
          ><template slot-scope="{ row }">{{ kindLabel(row.kind) }}</template></el-table-column
        >
        <el-table-column prop="reason" label="申请原因" min-width="200" />
        <el-table-column label="状态" width="135"
          ><template slot-scope="{ row }"
            >{{ statuses[row.status]
            }}<el-tag
              v-if="expired(row) && ['REQUESTED', 'APPROVED'].includes(row.status)"
              size="mini"
              type="info"
              >已过期</el-tag
            ></template
          ></el-table-column
        >
        <el-table-column prop="expiresAt" label="到期时间" min-width="210" />
        <el-table-column label="操作" min-width="230"
          ><template slot-scope="{ row }">
            <el-button v-permission="'system.approval.detail'" type="text" @click="showDetail(row)"
              >详情</el-button
            >
            <el-button
              v-if="canAction(row, 'approve')"
              type="text"
              :disabled="saving"
              @click="transition(row, 'approve')"
              >审批</el-button
            >
            <el-button
              v-if="canAction(row, 'execute')"
              type="text"
              :disabled="saving"
              @click="transition(row, 'execute')"
              >执行</el-button
            >
            <el-button
              v-if="canAction(row, 'review')"
              type="text"
              :disabled="saving"
              @click="transition(row, 'review')"
              >审计复核</el-button
            >
          </template></el-table-column
        >
      </el-table>
      <div class="toolbar pagination">
        <el-button :disabled="!history.length || loading" @click="previous">上一页</el-button
        ><span>第 {{ history.length + 1 }} 页</span
        ><el-button :disabled="!nextCursor || loading" @click="next">下一页</el-button>
      </div>
    </el-card>
    <el-dialog title="申请详情" :visible.sync="detailVisible" width="760px">
      <div v-loading="detailLoading">
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="编号">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="类型 / 状态"
              >{{ kindLabel(detail.kind) }} / {{ statuses[detail.status] }}</el-descriptions-item
            >
            <el-descriptions-item label="原因">{{ detail.reason }}</el-descriptions-item>
            <el-descriptions-item label="到期">{{ detail.expiresAt }}</el-descriptions-item>
            <el-descriptions-item v-for="stage in stages" :key="stage.actor" :label="stage.label"
              >{{ detail[stage.actor] || '未处理' }} · {{ detail[stage.time] || '—' }}
              <p v-if="detail[stage.note]">{{ detail[stage.note] }}</p></el-descriptions-item
            >
          </el-descriptions>
          <h4>申请变更内容</h4>
          <pre>{{ JSON.stringify(detail.payload, null, 2) }}</pre>
        </template>
      </div>
    </el-dialog>
    <el-dialog
      title="新建受控审批申请"
      :visible.sync="createVisible"
      width="720px"
      :close-on-click-modal="false">
      <el-alert v-if="formError" :title="formError" type="error" :closable="false" />
      <el-form :model="form" label-width="115px">
        <el-form-item label="申请类型"
          ><el-select v-model="form.kind"
            ><el-option
              v-for="kind in kinds"
              :key="kind.value"
              :label="kind.label"
              :value="kind.value" /></el-select
        ></el-form-item>
        <el-form-item
          v-if="['ROLE_GRANT', 'ROLE_REVOKE', 'MFA_RESET'].includes(form.kind)"
          label="用户 UUID"
          ><el-input v-model.trim="form.userId" placeholder="公开 userId，不使用数据库数字 ID"
        /></el-form-item>
        <el-form-item
          v-if="!['API_ROUTE_CHANGE', 'ELEVATED_REVOKE', 'MFA_RESET'].includes(form.kind)"
          label="角色 UUID"
          ><el-input v-model.trim="form.roleId" placeholder="公开 roleId"
        /></el-form-item>
        <el-alert
          v-if="form.kind === 'MFA_RESET'"
          title="仅用于管理员认证器丢失等恢复场景。执行后会清空目标账号 MFA 并吊销其现有会话，目标用户需重新登录并绑定认证器。"
          type="warning"
          :closable="false" />
        <el-form-item
          v-if="['ROLE_PERMISSIONS', 'ROLE_PERMISSION_REVOKE'].includes(form.kind)"
          label="权限 UUID"
          ><el-input
            v-model.trim="form.permissionIds"
            type="textarea"
            :rows="4"
            placeholder="每行一个 UUID，最多 200 个；只处理所列权限"
        /></el-form-item>
        <el-form-item v-if="form.kind === 'ELEVATED_REVOKE'" label="授权范围 UUID">
          <el-input v-model.trim="form.scopeId" placeholder="已审批的数据范围授权 UUID" />
        </el-form-item>
        <template v-if="form.kind === 'API_ROUTE_CHANGE'">
          <el-alert
            title="必须是已注册的后端方法和路径，且该接口不能有有效角色授权。路由变更是永久配置变更，到期不会自动恢复。"
            type="warning"
            :closable="false" />
          <el-form-item label="接口 UUID"><el-input v-model.trim="form.apiId" /></el-form-item>
          <el-form-item label="新权限码"
            ><el-input v-model.trim="form.code" maxlength="128"
          /></el-form-item>
          <el-form-item label="新方法"
            ><el-select v-model="form.method"
              ><el-option
                v-for="method in methods"
                :key="method"
                :label="method"
                :value="method" /></el-select
          ></el-form-item>
          <el-form-item label="新路径"
            ><el-input v-model.trim="form.path" maxlength="255" placeholder="/api/v1/orders/:id"
          /></el-form-item>
        </template>
        <template v-if="form.kind === 'ELEVATED_SCOPE'">
          <el-form-item label="资源"
            ><el-input
              v-model.trim="form.resource"
              maxlength="128"
              placeholder="必须是有效权限中已存在的资源"
          /></el-form-item>
          <el-form-item label="受控范围"
            ><el-select v-model="form.scopeType"
              ><el-option label="指定目标 CUSTOM" value="CUSTOM" /><el-option
                label="全部 ALL"
                value="ALL" /></el-select
          ></el-form-item>
          <template v-if="form.scopeType === 'CUSTOM'">
            <p>仅接受组织主数据中已存在的目标 UUID；服务端会核实目标和租户边界。</p>
            <div v-for="(target, index) in form.targets" :key="index" class="toolbar">
              <el-select v-model="target.targetType"
                ><el-option
                  v-for="type in targetTypes"
                  :key="type"
                  :label="type"
                  :value="type" /></el-select
              ><el-input v-model.trim="target.targetId" placeholder="目标 UUID" /><el-button
                @click="form.targets.splice(index, 1)"
                >移除</el-button
              >
            </div>
            <el-button
              :disabled="form.targets.length >= 200"
              @click="form.targets.push({ targetType: 'USER', targetId: '' })"
              >添加目标</el-button
            >
          </template>
        </template>
        <el-form-item label="申请原因"
          ><el-input v-model.trim="form.reason" type="textarea" maxlength="255" show-word-limit
        /></el-form-item>
        <el-form-item label="到期时间"
          ><el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            placeholder="必填，未来 24 小时内"
        /></el-form-item>
      </el-form>
      <p>此时间同时限制审批/执行期限与角色、权限、数据范围的授权有效期。</p>
      <span slot="footer"
        ><el-button @click="createVisible = false">取消</el-button
        ><el-button type="primary" :disabled="!canCreate" :loading="saving" @click="submit"
          >提交申请</el-button
        ></span
      >
    </el-dialog>
  </div>
</template>

<script>
import {
  getApprovals,
  getApproval,
  createApproval,
  approveRequest,
  executeRequest,
  reviewRequest,
} from '@/api/admin'
import { APPROVAL_KINDS, approvalBody } from './utils'
import { HTTP_METHODS, requestReason } from '../utils'
const emptyForm = () => ({
  kind: 'ROLE_GRANT',
  userId: '',
  roleId: '',
  scopeId: '',
  permissionIds: '',
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
  data() {
    return {
      kinds: APPROVAL_KINDS,
      methods: HTTP_METHODS,
      targetTypes: ['USER', 'DEPARTMENT', 'ORGANIZATION', 'TENANT'],
      statuses: { REQUESTED: '待审批', APPROVED: '待执行', EXECUTED: '待复核', REVIEWED: '已复核' },
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
      detailVisible: false,
      detailLoading: false,
      detailError: '',
      detail: null,
      detailRequest: 0,
      stages: [
        { label: '申请人', actor: 'applicantId', time: 'createdAt' },
        { label: '审批人', actor: 'approverId', time: 'approvedAt', note: 'approvalNote' },
        { label: '执行人', actor: 'executorId', time: 'executedAt', note: 'executionNote' },
        { label: '复核人', actor: 'reviewerId', time: 'reviewedAt', note: 'reviewNote' },
      ],
    }
  },
  computed: {
    canCreate() {
      return (
        this.can('system.approval.create') &&
        (this.can('system.role.grant') ||
          this.can('system.role.revoke') ||
          this.can('system.user.mfa-reset'))
      )
    },
  },
  created() {
    this.load()
  },
  methods: {
    can(code) {
      return (this.$store.getters.menu_list || []).includes(code)
    },
    kindLabel(kind) {
      return this.kinds.find((item) => item.value === kind)?.label || kind
    },
    expired(row) {
      return new Date(row.expiresAt).getTime() <= Date.now()
    },
    canAction(row, action) {
      const ownId = this.$store.state.user.user_info.userId
      const expected = { approve: 'REQUESTED', execute: 'APPROVED', review: 'EXECUTED' }[action]
      const extra = {
        approve: 'system.role.review',
        execute: ['ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE'].includes(row.kind)
          ? 'system.role.revoke'
          : row.kind === 'MFA_RESET'
          ? 'system.user.mfa-reset'
          : 'system.role.grant',
        review: 'system.audit.review',
      }[action]
      if (
        !ownId ||
        row.status !== expected ||
        !this.can('system.approval.' + action) ||
        !this.can(extra)
      )
        return false
      if (action !== 'review' && this.expired(row)) return false
      if (action === 'approve' && row.applicantId === ownId) return false
      if (action === 'review' && [row.applicantId, row.approverId, row.executorId].includes(ownId))
        return false
      return row.payload?.userId !== ownId
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
      this.createVisible = true
    },
    async submit() {
      if (this.saving || !this.canCreate) return
      let body
      try {
        body = approvalBody(this.form)
      } catch (error) {
        this.formError = error.message
        return
      }
      if (
        !(await this.$confirm(
          '确认提交“' +
            this.kindLabel(body.kind) +
            '”申请？到期：' +
            new Date(body.expiresAt).toLocaleString(),
          '提交审批',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      this.formError = ''
      try {
        await createApproval(body)
        this.createVisible = false
        this.$message.success('申请已提交，等待独立审批')
        this.reset()
      } catch (error) {
        this.formError = error.message || '提交失败，请重新认证后重试'
      } finally {
        this.saving = false
      }
    },
    async transition(row, action) {
      if (this.saving || !this.canAction(row, action)) return
      const note = await requestReason(
        this,
        { approve: '审批通过', execute: '执行变更', review: '审计复核' }[action],
        '申请 ' + row.id + '：' + row.reason + '。请填写处理意见。'
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
  },
}
</script>

<style scoped>
.approval-page {
  padding: 20px;
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
