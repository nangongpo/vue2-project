<template>
  <el-dialog
    :title="kind === 'role' ? '角色权限授权' : '用户角色分配'"
    :visible="visible"
    width="720px"
    :close-on-click-modal="false"
    :before-close="close"
    @open="load">
    <div v-loading="loading">
      <p v-if="target">
        {{ target.name || target.displayName }} · {{ target.roleType || '用户' }} ·
        {{ target.status }}
      </p>
      <el-alert
        title="页面、按钮与接口独立选择，不自动授予关联权限。高危授权请通过独立审批页面申请。"
        type="info"
        :closable="false" />
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-form ref="grantForm" :model="form" :rules="rules" label-width="100px">
        <el-form-item v-for="group in groups" :key="group.type" :label="group.label">
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
        <el-form-item label="操作原因" prop="reason"
          ><el-input v-model.trim="form.reason" type="textarea" maxlength="255" show-word-limit
        /></el-form-item>
        <el-form-item label="到期时间"
          ><el-date-picker
            v-model="form.expiresAt"
            type="datetime"
            placeholder="可选，不填表示无到期时间"
        /></el-form-item>
      </el-form>
      <p>
        本次新增 {{ changes.added.length }} 项，回收
        {{ changes.removed.length }} 项。保存将更新所选授权的有效期。
      </p>
      <p v-if="kind === 'role'" class="muted">
        数据范围需通过独立授权流程配置，本操作不改变数据范围。
      </p>
    </div>
    <span slot="footer"
      ><el-button :disabled="saving" @click="close">取消</el-button
      ><el-button
        type="primary"
        :disabled="blocked || loading || !canManage"
        :loading="saving"
        @click="submit"
        >确认授权变更</el-button
      ></span
    >
  </el-dialog>
</template>

<script>
import { getRoles, getRolePermissionOptions, updateRoleGrants, updateUserRoles } from '@/api/admin'
import { grantChanges, requiredText } from '@/views/system/permission/utils'

export default {
  name: 'PermissionGrantDialog',
  props: {
    visible: Boolean,
    target: { type: Object, default: null },
    kind: { type: String, default: 'role' },
  },
  data() {
    return {
      loading: false,
      saving: false,
      error: '',
      blocked: true,
      options: [],
      originalIds: [],
      form: { selection: { PAGE: [], BUTTON: [], API: [], ROLE: [] }, reason: '', expiresAt: null },
      rules: { reason: requiredText('操作原因') },
    }
  },
  computed: {
    canManage() {
      const codes = this.$store.getters.menu_list || []
      return (
        codes.includes('*') ||
        [
          this.kind === 'role' ? 'system.role.grant' : 'system.user.grant',
          'system.role.revoke',
          'system.role.options',
          'system.role.read',
        ].every((code) => codes.includes(code))
      )
    },
    groups() {
      return (
        this.kind === 'role'
          ? [
              { type: 'PAGE', label: '页面权限' },
              { type: 'BUTTON', label: '按钮权限' },
              { type: 'API', label: '接口权限' },
            ]
          : [{ type: 'ROLE', label: '业务角色' }]
      ).map((group) => ({
        ...group,
        items: this.options.filter((item) => item.type === group.type),
      }))
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
    async load() {
      this.loading = true
      this.blocked = true
      this.error = ''
      this.options = []
      this.originalIds = []
      this.form = {
        selection: { PAGE: [], BUTTON: [], API: [], ROLE: [] },
        reason: '',
        expiresAt: null,
      }
      this.$nextTick(() => this.$refs.grantForm?.clearValidate())
      try {
        if (!this.canManage) throw new Error('需要同时具备角色授权和回收权限')
        if (this.target.status !== 'ACTIVE') throw new Error('仅启用的用户或角色可授权')
        const [roles, permissions] = await Promise.all([getRoles(), getRolePermissionOptions()])
        // Options are the server's ordinary-permission allowlist; never infer grants from page bindings.
        const allowed = permissions.filter(
          (item) =>
            ['PAGE', 'BUTTON', 'API'].includes(item.type) &&
            item.status === 'ACTIVE' &&
            item.requiredRoleType === 'BUSINESS' &&
            !item.code.includes('*')
        )
        const allowedCodes = new Set(allowed.map((item) => item.code))
        const ordinary = (role) =>
          role.roleType === 'BUSINESS' &&
          Array.isArray(role.permissions) &&
          role.permissions.every((item) => allowedCodes.has((item.permission || item).code))
        if (this.kind === 'role') {
          const role = roles.find((item) => item.roleId === this.target.roleId)
          if (!role || role.status !== 'ACTIVE' || !ordinary(role))
            throw new Error('该角色不可通过普通流程授权，高危权限需审批后处理')
          this.originalIds = [...(role.permissionIds || [])]
          this.options = allowed
        } else {
          this.originalIds = (this.target.roles || []).map((item) => (item.role || item).roleId)
          if (
            this.originalIds.some(
              (id) => !roles.some((role) => role.roleId === id && ordinary(role))
            )
          )
            throw new Error('当前绑定包含高危或不可核实角色，需通过审批流程变更')
          this.options = roles
            .filter((role) => role.status === 'ACTIVE' && ordinary(role))
            .map((role) => ({ ...role, id: role.roleId, type: 'ROLE' }))
        }
        // Do not silently discard existing grants omitted from the current options.
        if (this.originalIds.some((id) => !this.options.some((option) => option.id === id)))
          throw new Error('现有授权含不可用项，无法安全覆盖；请先复核授权')
        this.groups.forEach((group) => {
          this.form.selection[group.type] = group.items
            .filter((item) => this.originalIds.includes(item.id))
            .map((item) => item.id)
        })
        this.blocked = false
      } catch (error) {
        this.error = error.message || '授权选项加载失败'
      } finally {
        this.loading = false
      }
    },
    async submit() {
      if (this.blocked || this.loading || this.saving || !this.canManage) return
      if (!(await this.$refs.grantForm.validate().catch(() => false))) return
      const expiresAt = this.form.expiresAt ? new Date(this.form.expiresAt) : null
      if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
        this.$message.warning('到期时间必须在未来')
        return
      }
      if (this.selectedIds.length > 500) {
        this.$message.warning('最多选择 500 项')
        return
      }
      if (
        !(await this.$confirm(
          '为“' +
            (this.target.name || this.target.displayName) +
            '”新增 ' +
            this.changes.added.length +
            ' 项，回收 ' +
            this.changes.removed.length +
            ' 项。到期时间：' +
            (expiresAt ? expiresAt.toLocaleString() : '无') +
            '。确认执行？',
          '授权影响确认',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      this.error = ''
      try {
        const body = {
          [this.kind === 'role' ? 'permissionIds' : 'roleIds']: this.selectedIds,
          reason: this.form.reason,
          ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
        }
        await (this.kind === 'role' ? updateRoleGrants : updateUserRoles)(
          this.kind === 'role' ? this.target.roleId : this.target.userId,
          body
        )
        this.$message.success('授权变更已保存')
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
.full-width {
  width: 100%;
}
.el-alert {
  margin-bottom: 16px;
}
.muted {
  color: #909399;
}
</style>
