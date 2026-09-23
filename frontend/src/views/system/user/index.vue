<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input v-model="query.keyword" clearable placeholder="用户名/姓名" @keyup.enter.native="loadUsers" />
        <el-button type="primary" @click="loadUsers">查询</el-button>
        <el-button v-permission="'user:create'" type="success" @click="openCreate">新增用户</el-button>
      </div>
      <el-table v-loading="loading" :data="users" border stripe>
        <el-table-column prop="username" label="用户名" min-width="150" />
        <el-table-column prop="displayName" label="姓名" min-width="150" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="角色" min-width="180">
          <template slot-scope="scope">{{ scope.row.roles.map(item => item.role.name).join('、') || '未分配' }}</template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最近登录" min-width="180" />
        <el-table-column label="操作" width="220" fixed="right">
          <template slot-scope="scope">
            <el-button v-permission="'user:update'" type="text" @click="openEdit(scope.row)">编辑</el-button>
            <el-button v-permission="'user:reset-password'" type="text" @click="openReset(scope.row)">重置密码</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination class="pagination" background layout="total, prev, pager, next" :current-page.sync="query.page" :page-size="query.pageSize" :total="total" @current-change="loadUsers" />
    </el-card>

    <el-dialog :title="editing ? '编辑用户' : '新增用户'" :visible.sync="dialogVisible" width="460px">
      <el-form :model="form" label-width="90px">
        <el-form-item v-if="!editing" label="用户名"><el-input v-model="form.username" /></el-form-item>
        <el-form-item label="姓名"><el-input v-model="form.displayName" /></el-form-item>
        <el-form-item v-if="!editing" label="初始密码"><el-input v-model="form.password" type="password" show-password /></el-form-item>
        <el-form-item v-if="editing" label="状态"><el-select v-model="form.status" style="width: 100%"><el-option label="正常" value="ACTIVE" /><el-option label="锁定" value="LOCKED" /><el-option label="停用" value="DISABLED" /></el-select></el-form-item>
        <el-form-item label="角色"><el-select v-model="form.roleIds" multiple style="width: 100%"><el-option v-for="role in roles" :key="role.roleId" :label="role.name" :value="role.roleId" /></el-select></el-form-item>
      </el-form>
      <span slot="footer"><el-button @click="dialogVisible = false">取消</el-button><el-button type="primary" :loading="saving" @click="submitUser">保存</el-button></span>
    </el-dialog>

    <el-dialog title="重置密码" :visible.sync="resetVisible" width="420px">
      <el-form :model="resetForm" label-width="90px"><el-form-item label="新密码"><el-input v-model="resetForm.password" type="password" show-password /></el-form-item></el-form>
      <span slot="footer"><el-button @click="resetVisible = false">取消</el-button><el-button type="primary" :loading="resetting" @click="submitReset">确认重置</el-button></span>
    </el-dialog>
  </div>
</template>

<script>
import { createUser, getRoles, getUsers, resetUserPassword, updateUser } from '@/api/admin'

export default {
  name: 'SystemUser',
  data() {
    return { loading: false, saving: false, resetting: false, users: [], roles: [], total: 0, query: { page: 1, pageSize: 20, keyword: '' }, dialogVisible: false, resetVisible: false, editing: false, form: { username: '', displayName: '', password: '', status: 'ACTIVE', roleIds: [] }, resetForm: { userId: '', password: '' } }
  },
  created() { this.loadUsers(); this.loadRoles() },
  methods: {
    async loadUsers() {
      this.loading = true
      try { const result = await getUsers(this.query); this.users = result.items || []; this.total = result.total || 0 } finally { this.loading = false }
    },
    async loadRoles() { this.roles = await getRoles() || [] },
    openCreate() { this.editing = false; this.form = { username: '', displayName: '', password: '', status: 'ACTIVE', roleIds: [] }; this.dialogVisible = true },
    openEdit(user) { this.editing = true; this.form = { userId: user.userId, username: user.username, displayName: user.displayName, status: user.status, roleIds: (user.roles || []).map(item => item.role.roleId), password: '' }; this.dialogVisible = true },
    async submitUser() {
      this.saving = true
      try {
        if (this.editing) { await updateUser(this.form.userId, { displayName: this.form.displayName, status: this.form.status, roleIds: this.form.roleIds }); this.$message.success('用户更新成功') }
        else { await createUser({ username: this.form.username, displayName: this.form.displayName, password: this.form.password, roleIds: this.form.roleIds }); this.$message.success('用户创建成功') }
        this.dialogVisible = false; await this.loadUsers()
      } finally { this.saving = false }
    },
    openReset(user) { this.resetForm = { userId: user.userId, password: '' }; this.resetVisible = true },
    async submitReset() {
      this.resetting = true
      try { await resetUserPassword(this.resetForm.userId, this.resetForm.password); this.$message.success('密码已重置'); this.resetVisible = false } finally { this.resetting = false }
    }
  }
}
</script>

<style lang="scss" scoped>
.page-container { padding: 20px; }
.toolbar { display: flex; gap: 10px; margin-bottom: 16px; }
.toolbar .el-input { width: 240px; }
.pagination { margin-top: 16px; text-align: right; }
</style>
