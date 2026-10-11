<template>
  <el-dialog
    title="角色权限授权"
    :visible="visible"
    width="720px"
    :close-on-click-modal="false"
    :before-close="close"
    @open="prepare">
    <div v-loading="loading">
      <div class="role-summary">
        <strong>{{ role ? role.name : '—' }}</strong>
        <el-tag v-if="role" size="mini" :type="role.isActive ? 'success' : 'info'">
          {{ role.statusLabel || '—' }}
        </el-tag>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <security-verification-gate
        v-if="!loaded"
        permission="system.role.grants.read"
        title="配置角色权限需要安全验证"
        description="需要安全管理员权限，并完成 5 分钟内的 MFA 和重新认证。"
        button-text="验证并配置"
        :loading="loading"
        @verify="load" />
      <el-form v-else ref="grantForm" :model="form" :rules="rules" label-width="85px" class="grant-form">
        <el-form-item v-for="group in groups" :key="group.type" :class="'grant-' + group.type.toLowerCase()" :label="group.label">
          <el-select
            v-model="form.selection[group.type]"
            multiple
            filterable
            class="full-width"
            :disabled="blocked || loading"
            :placeholder="'独立选择' + group.label">
            <el-option
              v-for="item in group.items"
              :key="item.id"
              :label="item.name + ' (' + item.code + ')'"
              :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作原因" prop="reason" class="grant-reason">
          <el-input v-model.trim="form.reason" type="textarea" maxlength="255" show-word-limit />
        </el-form-item>
        <authorization-expiry-field v-model="form.expiresAt" />
      </el-form>
    </div>
    <span slot="footer">
      <el-button :disabled="saving" @click="close">取消</el-button>
      <el-button v-if="loaded"
        type="primary"
        :disabled="!loaded || blocked || loading"
        :loading="saving"
        @click="submit">
        保存
      </el-button>
    </span>
  </el-dialog>
</template>

<script>
import { getRoleGrants, getRolePermissionOptions, updateRoleGrants } from '@/api/admin'
import { grantChanges, requiredText } from '@/views/system/permission/utils'
import { hasAvailableAction } from '@/utils/available-action'
import AuthorizationExpiryField from './AuthorizationExpiryField.vue'
import SecurityVerificationGate from '@/components/SecurityVerificationGate.vue'

export default {
  name: 'RolePermissionGrantDialog',
  components: { AuthorizationExpiryField, SecurityVerificationGate },
  props: {
    visible: Boolean,
    role: { type: Object, default: null },
  },
  data() {
    return {
      loading: false,
      saving: false,
      blocked: true,
      loaded: false,
      error: '',
      options: [],
      originalIds: [],
      form: { selection: { PAGE: [], BUTTON: [], API: [] }, reason: '', expiresAt: null },
      rules: { reason: requiredText('操作原因') },
    }
  },
  computed: {
    groups() {
      return [
        { type: 'PAGE', label: '页面权限' },
        { type: 'BUTTON', label: '按钮权限' },
        { type: 'API', label: '接口权限' },
      ].map((group) => ({ ...group, items: this.options.filter((item) => item.type === group.type) }))
    },
    selectedIds() {
      return [...new Set(this.groups.flatMap((group) => this.form.selection[group.type]))]
    },
    changes() {
      return grantChanges(this.originalIds, this.selectedIds)
    },
  },
  methods: {
    close() {
      if (!this.saving) this.$emit('update:visible', false)
    },
    prepare() {
      this.loading = false
      this.error = ''
      this.options = []
      this.originalIds = []
      this.loaded = false
      this.blocked = true
      this.form = { selection: { PAGE: [], BUTTON: [], API: [] }, reason: '', expiresAt: null }
    },
    async load() {
      this.loading = true
      this.blocked = true
      this.error = ''
      this.options = []
      this.originalIds = []
      this.loaded = false
      this.form = { selection: { PAGE: [], BUTTON: [], API: [] }, reason: '', expiresAt: null }
      try {
        if (!this.role || !this.role.isActive) throw new Error('仅启用的业务角色可授权')
        if (!hasAvailableAction(this.role, 'grant')) throw new Error('管理角色不能通过普通授权变更')
        const [permissions, grants] = await Promise.all([
          getRolePermissionOptions(),
          getRoleGrants(this.role.roleId),
        ])
        this.options = permissions.filter(
          (item) =>
            ['PAGE', 'BUTTON', 'API'].includes(item.type) &&
            item.isActive &&
            !item.code.includes('*')
        )
        this.originalIds = [...(grants.permissionIds || [])]
        if (this.originalIds.some((id) => !this.options.some((item) => item.id === id)))
          throw new Error('现有授权含高危或不可核实权限，不能用普通流程覆盖')
        this.groups.forEach((group) => {
          this.form.selection[group.type] = group.items
            .filter((item) => this.originalIds.includes(item.id))
            .map((item) => item.id)
        })
        this.loaded = true
        this.blocked = false
      } catch (error) {
        this.error = error.message || '授权选项加载失败'
      } finally {
        this.loading = false
      }
    },
    async submit() {
      if (this.blocked || this.loading || this.saving) return
      if (!(await this.$refs.grantForm.validate().catch(() => false))) return
      const expiresAt = new Date(this.form.expiresAt)
      if (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date()) {
        this.$message.warning('请设置有效的授权到期时间')
        return
      }
      if (!(await this.$confirm(
        '为“' + this.role.name + '”新增 ' + this.changes.added.length + ' 项，回收 ' + this.changes.removed.length + ' 项。确认继续？',
        '确认角色权限变更',
        { type: 'warning' }
      ).then(() => true).catch(() => false))) return
      this.saving = true
      this.error = ''
      try {
        await updateRoleGrants(this.role.roleId, {
          permissionIds: this.selectedIds,
          reason: this.form.reason,
          expiresAt: expiresAt.toISOString(),
        })
        this.$emit('update:visible', false)
        this.$emit('saved')
      } catch (error) {
        this.error = error.message || '授权失败，请检查后重试'
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.role-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.grant-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 16px;
}
.grant-form .el-form-item {
  margin-bottom: 12px;
}
.grant-api,
.grant-reason {
  grid-column: 1 / -1;
}
.grant-expires {
  margin-bottom: 0 !important;
}
.grant-expires ::v-deep .el-date-editor {
  width: 100%;
}
.full-width { width: 100%; }
.el-alert { margin-bottom: 12px; }
@media (max-width: 640px) {
  .grant-form {
    display: block;
  }
}
</style>
