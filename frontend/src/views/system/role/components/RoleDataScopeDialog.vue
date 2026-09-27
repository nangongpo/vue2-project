<template>
  <el-dialog
    title="角色数据范围"
    :visible="visible"
    width="680px"
    :close-on-click-modal="false"
    :before-close="close"
    @open="prepare">
    <div class="role-summary">
      <strong>{{ role ? role.name : '—' }}</strong>
      <el-tag v-if="role" size="mini" :type="role.isActive ? 'success' : 'info'">
        {{ role.statusLabel || '未知状态' }}
      </el-tag>
    </div>

    <el-alert v-if="error" :title="error" type="error" :closable="false" />

    <div v-if="!isBusinessRole" class="scope-gate approval-gate">
      <div class="scope-gate-title">该角色不能直接变更数据范围</div>
      <div class="scope-gate-text">系统、安全、审计管理员角色须通过受控审批流程变更。</div>
      <el-button type="primary" @click="goApproval">前往授权审批</el-button>
    </div>

    <div v-else-if="!scopeLoaded" class="scope-gate">
      <div class="scope-gate-title">查看数据范围需要安全验证</div>
      <div class="scope-gate-text">需要安全管理员权限，并完成 5 分钟内的 MFA 和重新认证。</div>
      <el-button v-permission="'system.data-scope.read'" type="primary" :loading="loading" @click="load">
        验证并查看
      </el-button>
    </div>

    <template v-else>
      <div class="scope-toolbar">
        <span class="scope-count">已配置 {{ scopes.length }} 项</span>
        <el-button v-permission="'system.data-scope.read'" size="mini" :disabled="loading || saving" @click="load">
          刷新
        </el-button>
      </div>
      <el-table v-loading="loading" :data="scopes" border class="scope-table">
        <el-table-column label="数据对象" min-width="160">
          <template slot-scope="{ row }">
            <span>{{ row.resourceName || row.resource }}</span>
            <span class="scope-code">{{ row.resource }}</span>
          </template>
        </el-table-column>
        <el-table-column label="范围" min-width="140">
          <template slot-scope="{ row }">{{ scopeLabel(row.scopeType) }}</template>
        </el-table-column>
        <el-table-column label="到期" min-width="170">
          <template slot-scope="{ row }">{{ row.expiresAt || '无到期时间' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template slot-scope="{ row }">
            {{ row.revokedAt ? '已撤销' : expired(row) ? '已过期' : '有效' }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="70">
          <template slot-scope="{ row }">
            <el-button
              v-permission="'system.data-scope.revoke'"
              type="text"
              :disabled="!!row.revokedAt || saving || !role || !role.isActive"
              @click="revoke(row)">
              撤销
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <template v-if="can('system.data-scope.update')">
        <div class="section-title">新增普通数据范围</div>
        <el-form ref="scopeForm" :model="form" :rules="rules" label-width="76px" class="scope-form">
          <el-form-item label="数据对象" prop="resource">
            <el-select
              v-model="form.resource"
              class="full-width"
              filterable
              default-first-option
              clearable
              placeholder="请选择数据对象">
              <el-option
                v-for="resource in resourceOptions"
                :key="resource.code"
                :label="resource.name + '（' + resource.code + '）'"
                :value="resource.code" />
            </el-select>
          </el-form-item>
          <el-form-item label="范围">
            <el-select v-model="form.scopeType">
              <el-option v-for="scope in options" :key="scope.value" :label="scope.label" :value="scope.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="原因" prop="reason">
            <el-input v-model.trim="form.reason" maxlength="255" placeholder="请输入操作原因" />
          </el-form-item>
          <el-form-item label="到期时间">
            <el-date-picker v-model="form.expiresAt" type="datetime" placeholder="可选" />
          </el-form-item>
        </el-form>
      </template>
    </template>

    <span slot="footer">
      <el-button :disabled="saving" @click="close">关闭</el-button>
      <el-button v-if="scopeLoaded && isBusinessRole" v-permission="'system.data-scope.update'" type="primary" :loading="saving"
        :disabled="loading || !role || !role.isActive" @click="grant">
        新增数据范围
      </el-button>
    </span>
  </el-dialog>
</template>

<script>
import {
  getDataResources,
  getRoleDataScopes,
  grantRoleDataScope,
  revokeRoleDataScope,
} from '@/api/admin'
import { STANDARD_SCOPES } from '@/views/system/approval/utils'
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
      scopeLoaded: false,
      options: STANDARD_SCOPES,
      resourceOptions: [],
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
      if (value) this.prepare()
    },
  },
  computed: {
    isBusinessRole() {
      return !!this.role?.capabilities?.canManageDataScope
    },
  },
  methods: {
    can(code) {
      return (this.$store.getters.menu_list || []).includes(code)
    },
    close() {
      if (!this.saving) this.$emit('update:visible', false)
    },
    prepare() {
      this.loading = false
      this.error = ''
      this.scopes = []
      this.resourceOptions = []
      this.scopeLoaded = false
      this.form = { resource: '', scopeType: 'SELF', reason: '', expiresAt: null }
      this.$nextTick(() => this.$refs.scopeForm?.clearValidate())
    },
    expired(scope) {
      return scope.expiresAt && new Date(scope.expiresAt) <= new Date()
    },
    scopeLabel(type) {
      return this.options.find((scope) => scope.value === type)?.label || type
    },
    goApproval() {
      this.close()
      this.$router.push('/system/approval')
    },
    async load() {
      if (!this.role || !this.can('system.data-scope.read')) {
        this.error = '缺少数据范围查询权限'
        return
      }
      this.loading = true
      this.error = ''
      this.scopes = []
      const roleId = this.role.roleId
      try {
        const result = await getRoleDataScopes(roleId)
        if (this.role?.roleId === roleId) {
          this.scopes = result.dataScopes || []
          await this.loadResourceOptions()
          this.scopeLoaded = true
        }
      } catch (error) {
        this.error = error.message || '数据范围加载失败'
      } finally {
        this.loading = false
      }
    },
    async loadResourceOptions() {
      if (!this.isBusinessRole || !this.can('system.data-resource.read')) return
      try {
        this.resourceOptions = await getDataResources('ACTIVE')
      } catch {
        this.resourceOptions = []
      }
    },
    async grant() {
      if (this.saving || !this.can('system.data-scope.update') || !this.role?.isActive) return
      if (!(await this.$refs.scopeForm.validate().catch(() => false))) return
      const expiresAt = this.form.expiresAt ? new Date(this.form.expiresAt) : null
      if (expiresAt && (!Number.isFinite(+expiresAt) || expiresAt <= new Date())) {
        this.$message.warning('到期时间必须在未来')
        return
      }
      if (!(await this.$confirm(
        `为“${this.role.name}”新增“${this.form.resource}”的“${this.scopeLabel(this.form.scopeType)}”范围，确认执行？`,
        '确认新增',
        { type: 'warning' }
      ).then(() => true).catch(() => false))) return
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
      if (this.saving || !this.can('system.data-scope.revoke')) return
      const reason = await requestReason(
        this,
        '撤销数据范围',
        `确认撤销“${scope.resource}”的“${this.scopeLabel(scope.scopeType)}”范围？请填写原因。`
      )
      if (!reason) return
      this.saving = true
      this.error = ''
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
.role-summary,
.scope-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.role-summary {
  justify-content: flex-start;
  margin-bottom: 10px;
}

.scope-gate {
  padding: 28px 20px;
  text-align: center;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafbfc;
}

.scope-gate-title,
.section-title {
  color: #303133;
  font-weight: 600;
}

.scope-gate-text,
.scope-count {
  color: #606266;
  font-size: 13px;
}

.scope-gate-text {
  margin: 8px 0 16px;
}

.scope-table {
  margin: 10px 0;
}

.scope-code {
  display: block;
  margin-top: 2px;
  color: #909399;
  font-size: 12px;
}

.section-title {
  margin: 14px 0 8px;
}

.scope-form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 16px;
}

.scope-form .el-form-item:nth-child(3),
.scope-form .el-form-item:nth-child(4) {
  margin-bottom: 0;
}

.form-help {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 18px;
}
</style>
