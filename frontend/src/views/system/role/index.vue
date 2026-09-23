<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar"><el-button v-permission="'role:create'" type="primary" @click="openCreate">新增角色</el-button></div>
      <el-table v-loading="loading" :data="roles" border stripe>
        <el-table-column prop="code" label="角色编码" min-width="180" />
        <el-table-column prop="name" label="角色名称" min-width="180" />
        <el-table-column prop="description" label="描述" min-width="220" />
        <el-table-column label="状态" width="100"><template slot-scope="scope"><el-tag :type="scope.row.status === 'ACTIVE' ? 'success' : 'info'">{{ scope.row.status === 'ACTIVE' ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="用户数" width="100"><template slot-scope="scope">{{ scope.row.userCount }}</template></el-table-column>
        <el-table-column label="操作" width="160"><template slot-scope="scope"><el-button v-permission="'role:update'" type="text" @click="openEdit(scope.row)">编辑</el-button><el-button v-permission="'role:delete'" type="text" :disabled="scope.row.code === 'system_admin'" @click="remove(scope.row)">删除</el-button></template></el-table-column>
      </el-table>
    </el-card>

    <el-dialog :title="editing ? '编辑角色' : '新增角色'" :visible.sync="dialogVisible" width="460px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="角色编码"><el-input v-model="form.code" /></el-form-item>
        <el-form-item label="角色名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" /></el-form-item>
        <el-form-item label="状态"><el-select v-model="form.status"><el-option label="启用" value="ACTIVE" /><el-option label="停用" value="DISABLED" /></el-select></el-form-item>
      </el-form>
      <span slot="footer"><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitRole">保存</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import { createRole, deleteRole, getRoles, updateRole } from '@/api/admin'

export default {
  name: 'SystemRole',
  data() { return { loading: false, saving: false, roles: [], dialogVisible: false, editing: false, form: { code: '', name: '', description: '', status: 'ACTIVE' } } },
  created() { this.loadRoles() },
  methods: {
    async loadRoles() { this.loading = true; try { this.roles = await getRoles() || [] } finally { this.loading = false } },
    openCreate() { this.editing = false; this.form = { code: '', name: '', description: '', status: 'ACTIVE' }; this.dialogVisible = true },
    openEdit(role) { this.editing = true; this.form = { roleId: role.roleId, code: role.code, name: role.name, description: role.description || '', status: role.status || 'ACTIVE' }; this.dialogVisible = true },
    async submitRole() { this.saving = true; try { if (this.editing) { await updateRole(this.form.roleId, { code: this.form.code, name: this.form.name, description: this.form.description, status: this.form.status }); this.$message.success('角色更新成功') } else { await createRole(this.form); this.$message.success('角色创建成功') }; this.dialogVisible = false; await this.loadRoles() } finally { this.saving = false } },
    async remove(role) { await this.$confirm(`确认删除角色“${role.name}”？`, '提示', { type: 'warning' }); await deleteRole(role.roleId); this.$message.success('角色已删除'); await this.loadRoles() }
  }
}
</script>

<style lang="scss" scoped>
.page-container { padding: 20px; }
.toolbar { margin-bottom: 16px; }
</style>
