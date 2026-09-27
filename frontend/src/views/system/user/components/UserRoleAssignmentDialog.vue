<template>
  <el-dialog
    title="用户角色分配"
    :visible="visible"
    width="520px"
    :close-on-click-modal="false"
    :before-close="close"
    @open="prepare">
    <div class="assignment-dialog" v-loading="loading">
      <el-alert v-if="error" :title="error" type="error" show-icon :closable="false" />
      <div v-if="approvalRequired" class="approval-block">
        <p>该账号含高危角色，不能直接分配。</p>
        <router-link to="/system/approval">
          <el-button type="primary" plain>前往授权审批</el-button>
        </router-link>
      </div>
      <el-form v-else ref="roleForm" :model="form" :rules="rules" label-width="80px" class="assignment-form">
        <el-form-item label="授权账号">
          <strong>{{ user ? user.displayName || user.username : '—' }}</strong>
          <el-tag v-if="user" :type="user.isLocked ? 'danger' : user.isActive ? 'success' : 'info'">
            {{ user.statusLabel || '未知状态' }}
          </el-tag>
        </el-form-item>
        <el-form-item label="当前角色">
          <span v-if="currentRoles.length">
            <span v-for="role in currentRoles" :key="role.id">
              <el-tag type="info" size="small">{{ role.name }}</el-tag>
            </span>
          </span>
          <span v-else class="empty-text">当前未分配</span>
        </el-form-item>
        <el-form-item label="调整角色" prop="roleIds">
          <el-select
            v-model="form.roleIds"
            multiple
            filterable
            class="full-width"
            :loading="optionsLoading"
            :disabled="blocked || loading"
            placeholder="展开后加载业务角色"
            @visible-change="onRoleSelectVisible">
            <el-option v-for="role in roles" :key="role.id" :label="role.name" :value="role.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="操作原因" prop="reason">
          <el-input
            v-model.trim="form.reason"
            type="textarea"
            maxlength="255"
            :rows="2"
            show-word-limit
            placeholder="请说明本次角色变更的业务依据" />
        </el-form-item>
        <el-form-item label="有效期限" prop="expiresAt">
          <el-radio-group v-model="expiryPreset" @change="setExpiryPreset">
            <el-radio-button label="never">长期授权</el-radio-button>
            <el-radio-button label="custom">自定义时间</el-radio-button>
          </el-radio-group>
          <el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            :disabled="expiryPreset !== 'custom'"
            placeholder="请选择到期时间" />
        </el-form-item>
      </el-form>
    </div>
    <span slot="footer">
      <el-button :disabled="saving" @click="close">取消</el-button>
      <el-button v-if="!approvalRequired" type="primary" :disabled="!canSubmit" :loading="saving" @click="submit">
        确认分配
      </el-button>
    </span>
  </el-dialog>
</template>

<script>
import { getRoleAssignmentOptions, updateUserRoles } from '@/api/admin'
import { requiredText } from '@/views/system/permission/utils'

export default {
  name: 'UserRoleAssignmentDialog',
  props: {
    visible: Boolean,
    user: { type: Object, default: null },
  },
  data() {
    return {
      loading: false,
      optionsLoading: false,
      saving: false,
      blocked: true,
      error: '',
      roles: [],
      rolesLoaded: false,
      approvalRequired: false,
      originalIds: [],
      expiryPreset: 'custom',
      form: { roleIds: [], reason: '', expiresAt: null },
      rules: { reason: requiredText('操作原因') },
    }
  },
  computed: {
    canManage() {
      const codes = this.$store.getters.menu_list || []
      return ['system.user.grant', 'system.role.revoke', 'system.role.read', 'system.role.assignment-options'].every((code) => codes.includes(code))
    },
    currentRoles() {
      return (this.user?.roles || []).map((item) => item.role || item).map((role) => ({
        id: role.roleId,
        name: role.name || role.code || role.roleId,
      }))
    },
    canSubmit() {
      return !this.blocked && !this.loading && !this.optionsLoading && this.rolesLoaded && !this.saving && this.canManage
    },
  },
  methods: {
    userStatusLabel(status) {
      return { ACTIVE: '启用', DISABLED: '停用', LOCKED: '锁定' }[status] || status || '未知'
    },
    close() {
      if (!this.saving) this.$emit('update:visible', false)
    },
    prepare() {
      this.loading = true
      this.blocked = true
      this.error = ''
      this.roles = []
      this.rolesLoaded = false
      this.approvalRequired = false
      this.originalIds = []
      this.expiryPreset = 'custom'
      this.form = { roleIds: [], reason: '', expiresAt: null }
      if (!this.canManage) this.error = '缺少用户角色授权或回收权限'
      else if (!this.user || !this.user.isActive || this.user.isLocked) this.error = '仅启用的用户可以分配角色'
      else {
        this.originalIds = (this.user.roles || []).map((item) => (item.role || item).roleId)
        if (this.user.needsRoleApproval) {
          this.approvalRequired = true
          this.blocked = true
          this.error = '该账号含高危角色，请通过受控审批变更。'
          this.loading = false
          return
        }
        this.setExpiryPreset('custom')
        this.blocked = false
      }
      this.loading = false
      this.$nextTick(() => this.$refs.roleForm?.clearValidate())
    },
    async onRoleSelectVisible(visible) {
      if (visible && !this.rolesLoaded) await this.loadOptions()
    },
    async loadOptions() {
      if (this.optionsLoading || this.rolesLoaded || this.blocked) return
      this.optionsLoading = true
      this.error = ''
      try {
        const roles = await getRoleAssignmentOptions()
        this.roles = Array.isArray(roles) ? roles : []
        if (this.originalIds.some((id) => !this.roles.some((role) => role.id === id))) {
          this.approvalRequired = true
          this.form.roleIds = []
          this.blocked = true
          throw new Error('该账号含高危角色，请通过受控审批变更。')
        }
        this.form.roleIds = [...this.originalIds]
        this.rolesLoaded = true
      } catch (error) {
        this.error = error.message || '业务角色加载失败，请重试'
      } finally {
        this.optionsLoading = false
      }
    },
    setExpiryPreset(value) {
      if (value === 'never') {
        this.form.expiresAt = null
        return
      }
      if (value === 'custom' && !this.form.expiresAt)
        this.form.expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000)
    },
    async submit() {
      if (!this.canSubmit) return
      if (!(await this.$refs.roleForm.validate().catch(() => false))) return
      const expiresAt = this.form.expiresAt ? new Date(this.form.expiresAt) : null
      const now = Date.now()
      if (this.expiryPreset === 'never') {
        if (expiresAt) this.form.expiresAt = null
      } else if (!expiresAt || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now || expiresAt.getTime() > now + 24 * 60 * 60 * 1000) {
        this.$message.warning('自定义时间必须在未来 24 小时内，或选择“长期授权”')
        return
      }
      if (!(await this.$confirm(
        '将更新“' + this.user.displayName + '”的业务角色，有效期：' + (expiresAt ? expiresAt.toLocaleString() : '长期授权') + '。确认继续？',
        '确认用户角色变更',
        { type: 'warning' }
      ).then(() => true).catch(() => false))) return
      this.saving = true
      this.error = ''
      try {
        await updateUserRoles(this.user.userId, {
          roleIds: this.form.roleIds,
          reason: this.form.reason,
          ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
        })
        this.$message.success('用户角色已更新')
        this.$emit('update:visible', false)
        this.$emit('saved')
      } catch (error) {
        this.error = error.message || '角色分配失败，请检查后重试'
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.full-width { width: 100%; }
.el-alert { margin-bottom: 16px; }
.assignment-dialog { color: #303133; }
.empty-text,
.submit-hint { color: #909399; font-size: 13px; }
strong { margin-right: 10px; }
.role-tags { display: flex; flex-wrap: wrap; gap: 6px; min-width: 0; }
.role-tags .el-tag { color: #526579; background: #f0f4f8; border-color: #cbd7e3; }
.form-row .el-select { flex: 1; }
.assignment-form { margin-top: 6px; }
.approval-block { padding: 12px 0 4px; text-align: center; }
.approval-block p { margin: 0 0 14px; color: #606266; }
</style>
