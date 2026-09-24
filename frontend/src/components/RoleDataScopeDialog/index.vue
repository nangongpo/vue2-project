<template>
  <el-dialog title="角色数据范围" :visible="visible" width="820px" :close-on-click-modal="false" :before-close="close"
    @open="load">
    <p>{{ role ? role.name : '' }} · {{ role ? role.status : '' }}</p>
    <p>
      需安全管理员权限与五分钟内的 MFA、重新认证。<router-link to="/system/session">前往账号安全验证</router-link>
    </p>
    <el-alert v-if="error" :title="error" type="error" :closable="false" />
    <el-button v-permission="'system.data.read'" :disabled="loading || saving" @click="load">刷新</el-button>
    <el-table v-loading="loading" :data="scopes" border class="scope-table">
      <el-table-column prop="resource" label="资源" min-width="140" />
      <el-table-column label="范围" min-width="140"><template slot-scope="{ row }">{{ scopeLabel(row.scopeType)
      }}</template></el-table-column>
      <el-table-column label="到期" min-width="190"><template slot-scope="{ row }">{{
        row.expiresAt || '无到期时间'
          }}</template></el-table-column>
      <el-table-column label="状态" width="100"><template slot-scope="{ row }">{{
        row.revokedAt ? '已撤销' : expired(row) ? '已过期' : '有效'
          }}</template></el-table-column>
      <el-table-column label="操作" width="80"><template slot-scope="{ row }"><el-button
            v-permission="'system.data.revoke'" type="text"
            :disabled="!!row.revokedAt || saving || !role || role.status !== 'ACTIVE'"
            @click="revoke(row)">撤销</el-button></template></el-table-column>
    </el-table>
    <template v-if="can('system.data.update')">
      <h4>新增普通数据范围</h4>
      <el-form ref="scopeForm" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="资源" prop="resource"><el-input v-model.trim="form.resource" maxlength="128"
            placeholder="明确的业务资源标识" /></el-form-item>
        <el-form-item label="范围"><el-select v-model="form.scopeType"><el-option v-for="scope in options"
              :key="scope.value" :label="scope.label" :value="scope.value" /></el-select></el-form-item>
        <el-form-item label="操作原因" prop="reason"><el-input v-model.trim="form.reason" type="textarea"
            maxlength="255" /></el-form-item>
        <el-form-item label="到期时间"><el-date-picker v-model="form.expiresAt" type="datetime"
            placeholder="可选，必须在未来" /></el-form-item>
      </el-form>
    </template>
    <p>
      组织和租户范围由服务端计算；CUSTOM / ALL 只能通过<router-link to="/system/permission/approval">受控审批</router-link>申请。
    </p>
    <span slot="footer"><el-button :disabled="saving" @click="close">关闭</el-button><el-button
        v-permission="'system.data.update'" type="primary" :loading="saving"
        :disabled="loading || !role || role.status !== 'ACTIVE'" @click="grant">新增数据范围</el-button></span>
  </el-dialog>
</template>

<script>
import { getRoleDataScopes, grantRoleDataScope, revokeRoleDataScope } from '@/api/admin'
import { STANDARD_SCOPES } from '@/views/system/permission/approval/utils'
import { requiredText, requestReason } from '@/views/system/permission/utils'
export default {
  name: 'RoleDataScopeDialog',
  props: { visible: Boolean, role: { type: Object, default: null } },
  data() {
    return {
      loading: false,
      saving: false,
      error: '',
      scopes: [],
      options: STANDARD_SCOPES,
      form: { resource: '', scopeType: 'SELF', reason: '', expiresAt: null },
      rules: {
        resource: [
          ...requiredText('资源'),
          { pattern: /^[a-z][a-z0-9_.:-]{0,127}$/, message: '请输入有效资源标识', trigger: 'blur' },
        ],
        reason: requiredText('操作原因'),
      },
    }
  },
  watch: {
    visible(value) {
      if (value) {
        this.form = { resource: '', scopeType: 'SELF', reason: '', expiresAt: null }
        this.$nextTick(() => this.$refs.scopeForm?.clearValidate())
      }
    },
  },
  methods: {
    can(code) {
      return (this.$store.getters.menu_list || []).includes(code)
    },
    close() {
      if (!this.saving) this.$emit('update:visible', false)
    },
    expired(scope) {
      return scope.expiresAt && new Date(scope.expiresAt) <= new Date()
    },
    scopeLabel(type) {
      return this.options.find((scope) => scope.value === type)?.label || type
    },
    async load() {
      if (!this.role || !this.can('system.data.read')) {
        this.error = '缺少数据范围查询权限'
        return
      }
      this.loading = true
      this.error = ''
      this.scopes = []
      const roleId = this.role.roleId
      try {
        const result = await getRoleDataScopes(roleId)
        if (this.role?.roleId === roleId) this.scopes = result.dataScopes || []
      } catch (error) {
        this.error = error.message || '数据范围加载失败'
      } finally {
        this.loading = false
      }
    },
    async grant() {
      if (this.saving || !this.can('system.data.update') || this.role?.status !== 'ACTIVE') return
      if (!(await this.$refs.scopeForm.validate().catch(() => false))) return
      const expiresAt = this.form.expiresAt ? new Date(this.form.expiresAt) : null
      if (expiresAt && (!Number.isFinite(+expiresAt) || expiresAt <= new Date())) {
        this.$message.warning('到期时间必须在未来')
        return
      }
      if (
        !(await this.$confirm(
          '为“' +
          this.role.name +
          '”新增资源“' +
          this.form.resource +
          '”的“' +
          this.scopeLabel(this.form.scopeType) +
          '”范围，确认执行？',
          '数据范围影响',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      this.error = ''
      try {
        await grantRoleDataScope(this.role.roleId, {
          resource: this.form.resource,
          scopeType: this.form.scopeType,
          reason: this.form.reason,
          ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
        })
        this.$message.success('数据范围已添加')
        await this.load()
      } catch (error) {
        this.error = error.message || '操作失败'
      } finally {
        this.saving = false
      }
    },
    async revoke(scope) {
      if (this.saving || !this.can('system.data.revoke')) return
      const reason = await requestReason(
        this,
        '撤销数据范围',
        '确认撤销资源“' +
        scope.resource +
        '”的“' +
        this.scopeLabel(scope.scopeType) +
        '”范围？请填写原因。'
      )
      if (!reason) return
      this.saving = true
      try {
        await revokeRoleDataScope(this.role.roleId, scope.id, reason)
        this.$message.success('数据范围已撤销')
        await this.load()
      } catch (error) {
        this.error = error.message || '撤销失败'
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.scope-table,
.el-alert {
  margin: 16px 0;
}
</style>
