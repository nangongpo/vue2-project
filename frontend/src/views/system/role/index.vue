<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button v-permission="'system.role.create'" type="primary" @click="openForm()"
          >新增角色</el-button
        >
        <el-button v-permission="'system.role.read'" @click="loadRoles">刷新</el-button>
      </div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <el-table v-loading="loading" :data="roles" border stripe>
        <el-table-column prop="code" label="角色编码" min-width="150" />
        <el-table-column prop="name" label="角色名称" min-width="150" />
        <el-table-column label="角色类型" width="120"
          ><template slot-scope="{ row }">{{ roleTypeLabel(row.roleType) }}</template></el-table-column
        >
        <el-table-column prop="description" label="职责说明" min-width="180" />
        <el-table-column label="状态" width="90"
          ><template slot-scope="{ row }"
            ><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{
              row.status === 'ACTIVE' ? '启用' : '停用'
            }}</el-tag></template
          ></el-table-column
        >
        <el-table-column prop="userCount" label="用户数" width="80" />
        <el-table-column label="操作" width="310"
          ><template slot-scope="{ row }">
            <el-button v-permission="'system.role.update'" type="text" @click="openForm(row)"
              >编辑</el-button
            >
            <el-button
              v-if="canGrant"
              type="text"
              :disabled="row.status !== 'ACTIVE' || row.roleType !== 'BUSINESS'"
              @click="openGrants(row)"
              >授权</el-button
            >
            <el-button
              v-permission="'system.role.disable'"
              type="text"
              :disabled="saving"
              @click="changeStatus(row)"
              >{{ row.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
            >
            <el-button v-permission="'system.data.read'" type="text" @click="openScopes(row)"
              >数据范围</el-button
            >
            <el-button
              v-permission="'system.role.delete'"
              type="text"
              :disabled="saving || row.roleType !== 'BUSINESS' || row.userCount > 0"
              @click="remove(row)"
              >删除</el-button
            >
          </template></el-table-column
        >
      </el-table>
    </el-card>
    <el-dialog
      :title="editingId ? '编辑角色' : '新增角色'"
      :visible.sync="dialogVisible"
      width="480px"
      :close-on-click-modal="false">
      <el-form ref="roleForm" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="角色编码" prop="code"
          ><el-input v-model.trim="form.code" maxlength="64"
        /></el-form-item>
        <el-form-item label="角色名称" prop="name"
          ><el-input v-model.trim="form.name" maxlength="128"
        /></el-form-item>
        <el-form-item label="职责说明"
          ><el-input v-model.trim="form.description" type="textarea" maxlength="255"
        /></el-form-item>
      </el-form>
      <span slot="footer"
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submitRole">保存</el-button></span
      >
    </el-dialog>
    <permission-grant-dialog
      :visible.sync="grantsVisible"
      :target="grantTarget"
      kind="role"
      @saved="loadRoles" />
    <role-data-scope-dialog :visible.sync="scopesVisible" :role="scopeRole" />
  </div>
</template>

<script>
import { createRole, deleteRole, getRoles, updateRole, setRoleStatus } from '@/api/admin'
import PermissionGrantDialog from '@/components/PermissionGrantDialog/index.vue'
import RoleDataScopeDialog from '@/components/RoleDataScopeDialog/index.vue'
import { requiredText, requestReason } from '../permission/utils'
export default {
  name: 'SystemRole',
  components: { PermissionGrantDialog, RoleDataScopeDialog },
  data() {
    return {
      loading: false,
      saving: false,
      loadError: '',
      roles: [],
      dialogVisible: false,
      editingId: null,
      grantsVisible: false,
      grantTarget: null,
      scopesVisible: false,
      scopeRole: null,
      form: { code: '', name: '', description: '' },
      rules: {
        code: [...requiredText('角色编码'), { min: 2, message: '至少 2 个字符', trigger: 'blur' }],
        name: requiredText('角色名称'),
      },
    }
  },
  computed: {
    canGrant() {
      return ['system.role.grant', 'system.role.revoke', 'system.role.options'].every(this.can)
    },
  },
  created() {
    this.loadRoles()
  },
  methods: {
    openScopes(role) {
      this.scopeRole = role
      this.scopesVisible = true
    },
    can(code) {
      const codes = this.$store.getters.menu_list || []
      return codes.includes(code) || codes.includes('*')
    },
    roleTypeLabel(type) {
      return {
        BUSINESS: '业务管理员',
        SYSTEM: '系统管理员',
        SECURITY: '安全管理员',
        AUDIT: '审计管理员',
      }[type] || type
    },
    async loadRoles() {
      if (!this.can('system.role.read')) {
        this.loadError = '缺少角色查询权限'
        return
      }
      this.loading = true
      this.loadError = ''
      try {
        this.roles = (await getRoles()) || []
      } catch (error) {
        this.roles = []
        this.loadError = error.message || '角色加载失败'
      } finally {
        this.loading = false
      }
    },
    openForm(role) {
      this.editingId = role?.roleId || null
      this.form = role
        ? { code: role.code, name: role.name, description: role.description || '' }
        : { code: '', name: '', description: '' }
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.roleForm?.clearValidate())
    },
    openGrants(role) {
      this.grantTarget = role
      this.grantsVisible = true
    },
    async submitRole() {
      if (this.saving || !this.can(this.editingId ? 'system.role.update' : 'system.role.create'))
        return
      if (!(await this.$refs.roleForm.validate().catch(() => false))) return
      this.saving = true
      try {
        const { code, name, description } = this.form
        if (this.editingId) await updateRole(this.editingId, { code, name, description })
        else await createRole({ code, name, description })
        this.dialogVisible = false
        this.$message.success('角色已保存')
        await this.loadRoles()
      } catch {
        /* Keep edits for retry. */
      } finally {
        this.saving = false
      }
    },
    async changeStatus(role) {
      if (this.saving || !this.can('system.role.disable')) return
      const status = role.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const reason = await requestReason(
        this,
        (status === 'DISABLED' ? '停用' : '启用') + '角色“' + role.name + '”',
        '影响 ' + role.userCount + ' 个用户；停用会使角色授权失效，启用会恢复现有授权。请填写原因。'
      )
      if (!reason) return
      this.saving = true
      try {
        await setRoleStatus(role.roleId, { status, reason })
        this.$message.success('角色状态已更新')
        await this.loadRoles()
      } catch {
        /* Reported by API layer. */
      } finally {
        this.saving = false
      }
    },
    async remove(role) {
      if (this.saving || !this.can('system.role.delete')) return
      if (
        !(await this.$confirm('确认永久删除角色“' + role.name + '”？', '删除角色', {
          type: 'warning',
        })
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        await deleteRole(role.roleId)
        this.$message.success('角色已删除')
        await this.loadRoles()
      } catch {
        /* Reported by API layer. */
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.page-container {
  padding: 20px;
}
.toolbar,
.el-alert {
  margin-bottom: 16px;
}
</style>
