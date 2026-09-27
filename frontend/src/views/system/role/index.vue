<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <el-button v-permission="'system.role.create'" type="primary" @click="openForm()">新增角色</el-button>
        <el-button v-permission="'system.role.read'" @click="loadRoles">刷新</el-button>
      </div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <el-table v-loading="loading" :data="roles" border stripe>
        <el-table-column prop="name" label="角色名称" width="140" />
        <el-table-column label="角色类型" width="100"><template slot-scope="{ row }">{{ row.roleTypeLabel
            }}</template></el-table-column>
        <el-table-column prop="description" label="职责说明" min-width="180" />
        <el-table-column label="状态" width="70"><template slot-scope="{ row }"><el-tag
              :type="row.isActive ? 'success' : 'info'">{{ row.statusLabel }}</el-tag></template></el-table-column>
        <el-table-column prop="userCount" label="用户数" width="80" />
        <el-table-column label="操作" width="240" fixed="right"><template slot-scope="{ row }">
            <el-button v-permission="'system.role.update'" type="text" :disabled="!row.capabilities?.canEdit" @click="openForm(row)">编辑</el-button>
            <el-button v-if="canGrant" type="text" title="配置角色权限" :disabled="!row.capabilities?.canGrant"
              @click="openGrants(row)">权限配置</el-button>
            <el-button v-permission="row.isActive ? 'system.role.disable' : 'system.role.enable'" type="text" :disabled="saving" @click="changeStatus(row)">{{
              row.isActive ? '停用' : '启用' }}</el-button>
            <el-button v-permission="'system.data-scope.read'" type="text" @click="openScopes(row)">数据范围</el-button>
            <el-button v-permission="'system.role.delete'" type="text" class="text-danger"
              :disabled="saving || !row.capabilities?.canDelete || row.userCount > 0" @click="remove(row)">删除</el-button>
          </template></el-table-column>
      </el-table>
    </el-card>
    <el-dialog :title="editingId ? '编辑角色' : '新增角色'" :visible.sync="dialogVisible" width="480px"
      :close-on-click-modal="false">
      <el-form ref="roleForm" :model="form" :rules="rules" label-width="90px">
        <el-form-item label="角色名称" prop="name"><el-input v-model.trim="form.name" maxlength="128" /></el-form-item>
        <el-form-item label="职责说明"><el-input v-model.trim="form.description" type="textarea"
            maxlength="255" /></el-form-item>
      </el-form>
      <span slot="footer"><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary"
          :loading="saving" @click="submitRole">保存</el-button></span>
    </el-dialog>
    <role-permission-grant-dialog :visible.sync="grantsVisible" :role="grantTarget" @saved="handleGrantsSaved" />
    <role-data-scope-dialog :visible.sync="scopesVisible" :role="scopeRole" />
  </div>
</template>

<script>
import { createRole, deleteRole, getRoles, updateRole, enableRole, disableRole } from '@/api/admin'
import RolePermissionGrantDialog from './components/RolePermissionGrantDialog.vue'
import RoleDataScopeDialog from './components/RoleDataScopeDialog.vue'
import { requiredText, requestReason } from '../permission/utils'
export default {
  name: 'SystemRole',
  components: { RolePermissionGrantDialog, RoleDataScopeDialog },
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
      form: { name: '', description: '' },
      rules: {
        name: requiredText('角色名称'),
      },
    }
  },
  computed: {
    canGrant() {
      return ['system.role.grant', 'system.role.grants.read', 'system.role.options'].every(this.can)
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
      return codes.includes(code)
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
      return this.roles
      } catch (error) {
        this.roles = []
        this.loadError = error.message || '角色加载失败'
      } finally {
        this.loading = false
      }
    },
    async handleGrantsSaved() {
      const roles = (await this.loadRoles()) || []
      const role = roles.find((item) => item.roleId === this.grantTarget?.roleId)
      const userCount = Number(role?.userCount || 0)
      if (userCount > 0) {
        this.$message.success('权限已对 ' + userCount + ' 个用户生效')
        return
      }
      const goToUsers = await this.$confirm(
        '角色暂无绑定用户，请先在用户管理中分配角色。',
        '权限配置完成',
        {
          type: 'info',
          confirmButtonText: '前往用户管理',
          cancelButtonText: '稍后处理',
        }
      )
        .then(() => true)
        .catch(() => false)
      if (goToUsers) this.$router.push('/system/user')
    },
    openForm(role) {
      this.editingId = role?.roleId || null
      this.form = role
        ? { name: role.name, description: role.description || '' }
        : { name: '', description: '' }
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
        const { name, description } = this.form
        if (this.editingId) await updateRole(this.editingId, { name, description })
        else await createRole({ name, description })
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
      const status = role.isActive ? 'DISABLED' : 'ACTIVE'
      const permission = role.isActive ? 'system.role.disable' : 'system.role.enable'
      if (this.saving || !this.can(permission)) return
      const reason = await requestReason(
        this,
        (status === 'DISABLED' ? '停用' : '启用') + '角色“' + role.name + '”',
        '影响 ' + role.userCount + ' 个用户；停用会使角色授权失效，启用会恢复现有授权。请填写原因。'
      )
      if (!reason) return
      this.saving = true
      try {
        if (role.isActive) await disableRole(role.roleId, reason)
        else await enableRole(role.roleId, reason)
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
