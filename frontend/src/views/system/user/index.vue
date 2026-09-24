<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="toolbar">
        <el-input
          v-model="query.keyword"
          clearable
          placeholder="用户名/姓名"
          maxlength="64"
          @keyup.enter.native="search" />
        <el-button v-permission="'system.user.read'" type="primary" @click="search">查询</el-button>
        <el-button v-permission="'system.user.create'" type="success" @click="openCreate">
          新增用户
        </el-button>
      </div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <el-table v-loading="loading" :data="users" border stripe>
        <el-table-column prop="username" label="用户名" min-width="150" />
        <el-table-column prop="displayName" label="姓名" min-width="150" />
        <el-table-column prop="status" label="状态" width="110" />
        <el-table-column label="角色" min-width="180">
          <template #default="scope">
            {{ (scope.row.roles || []).map((item) => item.role.name).join('、') || '未分配' }}
          </template>
        </el-table-column>
        <el-table-column prop="lastLoginAt" label="最近登录" min-width="180" />
        <el-table-column label="操作" width="350" fixed="right">
          <template #default="scope">
            <el-button v-permission="'system.user.update'" type="text" @click="openEdit(scope.row)">
              编辑
            </el-button>
            <el-button
              v-permission="'system.user.reset-password'"
              type="text"
              @click="openReset(scope.row)">
              重置密码
            </el-button>
            <el-button
              v-if="canGrant"
              type="text"
              :disabled="scope.row.status !== 'ACTIVE'"
              @click="openGrants(scope.row)"
              >分配角色</el-button
            >
            <el-button
              v-permission="'system.user.disable'"
              type="text"
              :disabled="saving || scope.row.status === 'LOCKED'"
              @click="changeStatus(scope.row)"
              >{{ scope.row.status === 'DISABLED' ? '启用' : '停用' }}</el-button
            >
            <el-button
              v-if="scope.row.status === 'LOCKED'"
              v-permission="'system.user.unlock'"
              type="text"
              :disabled="saving"
              @click="unlock(scope.row)"
              >解锁</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pagination"
        background
        layout="total, prev, pager, next"
        :current-page.sync="query.page"
        :page-size="query.pageSize"
        :total="total"
        @current-change="loadUsers" />
    </el-card>

    <el-dialog
      :title="editing ? '编辑用户' : '新增用户'"
      :visible.sync="dialogVisible"
      width="460px">
      <el-form ref="userForm" :model="form" :rules="rules" label-width="90px">
        <el-form-item v-if="!editing" label="用户名" prop="username">
          <el-input v-model.trim="form.username" maxlength="64" />
        </el-form-item>
        <el-form-item label="姓名" prop="displayName">
          <el-input v-model.trim="form.displayName" maxlength="128" />
        </el-form-item>
        <el-form-item v-if="!editing" label="初始密码" prop="password">
          <el-input v-model="form.password" type="password" maxlength="128" show-password />
          <div class="password-hint">
            密码需包含大小写字母、数字、符号中至少三类，或使用至少 20 个字符、四个不同词语的口令短语
          </div>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitUser"> 保存 </el-button>
      </span>
    </el-dialog>

    <el-dialog title="重置密码" :visible.sync="resetVisible" width="420px">
      <el-form
        ref="resetForm"
        :model="resetForm"
        :rules="{ password: rules.password }"
        label-width="90px">
        <el-form-item label="新密码" prop="password">
          <el-input v-model="resetForm.password" type="password" maxlength="128" show-password />
          <div class="password-hint">
            密码需包含大小写字母、数字、符号中至少三类，或使用至少 20 个字符、四个不同词语的口令短语
          </div>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="resetVisible = false">取消</el-button>
        <el-button type="primary" :loading="resetting" @click="submitReset"> 确认重置 </el-button>
      </span>
    </el-dialog>
    <permission-grant-dialog
      :visible.sync="grantsVisible"
      :target="grantTarget"
      kind="user"
      @saved="loadUsers" />
  </div>
</template>

<script>
import {
  createUser,
  getUsers,
  resetUserPassword,
  updateUser,
  setUserStatus,
  unlockUser,
} from '@/api/admin'
import PermissionGrantDialog from '@/components/PermissionGrantDialog/index.vue'
import { requiredText, requestReason } from '../permission/utils'
import allPatterns from '@/utils/patterns'

export default {
  name: 'SystemUser',
  components: { PermissionGrantDialog },
  data() {
    return {
      loading: false,
      saving: false,
      resetting: false,
      loadError: '',
      requestId: 0,
      users: [],
      total: 0,
      query: { page: 1, pageSize: 20, keyword: '' },
      dialogVisible: false,
      resetVisible: false,
      editing: false,
      grantsVisible: false,
      grantTarget: null,
      form: { username: '', displayName: '', password: '' },
      resetForm: { userId: '', password: '' },
      rules: {
        username: [
          ...requiredText('用户名'),
          { min: 2, max: 64, message: '用户名长度为 2–64 个字符', trigger: 'blur' },
        ],
        displayName: requiredText('姓名'),
        password: [allPatterns.password],
      },
    }
  },
  computed: {
    canGrant() {
      return [
        'system.user.grant',
        'system.role.revoke',
        'system.role.options',
        'system.role.read',
      ].every(this.can)
    },
  },
  created() {
    this.loadUsers()
  },
  methods: {
    can(code) {
      const codes = this.$store.getters.menu_list || []
      return codes.includes(code) || codes.includes('*')
    },
    search() {
      this.query.page = 1
      this.loadUsers()
    },
    async loadUsers() {
      if (!this.can('system.user.read')) {
        this.loadError = '缺少用户查询权限'
        return
      }
      const requestId = ++this.requestId
      this.loading = true
      this.loadError = ''
      try {
        const result = await getUsers(this.query)
        if (requestId !== this.requestId) return
        this.users = result.items || []
        this.total = result.total || 0
      } catch (error) {
        if (requestId === this.requestId) {
          this.users = []
          this.total = 0
          this.loadError = error.message || '用户加载失败'
        }
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    openCreate() {
      this.editing = false
      this.form = { username: '', displayName: '', password: '' }
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.userForm?.clearValidate())
    },
    openEdit(user) {
      this.editing = true
      this.form = {
        userId: user.userId,
        username: user.username,
        displayName: user.displayName,
        password: '',
      }
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.userForm?.clearValidate())
    },
    openGrants(user) {
      this.grantTarget = user
      this.grantsVisible = true
    },
    async submitUser() {
      if (this.saving || !this.can(this.editing ? 'system.user.update' : 'system.user.create'))
        return
      if (!(await this.$refs.userForm.validate().catch(() => false))) return
      this.saving = true
      try {
        if (this.editing) await updateUser(this.form.userId, { displayName: this.form.displayName })
        else
          await createUser({
            username: this.form.username,
            displayName: this.form.displayName,
            password: this.form.password,
          })
        this.form.password = ''
        this.dialogVisible = false
        this.$message.success('用户已保存')
        await this.loadUsers()
      } catch {
        /* Keep edits for retry. */
      } finally {
        this.saving = false
      }
    },
    openReset(user) {
      this.resetForm = { userId: user.userId, password: '' }
      this.resetVisible = true
      this.$nextTick(() => this.$refs.resetForm?.clearValidate())
    },
    async submitReset() {
      if (this.resetting || !this.can('system.user.reset-password')) return
      if (!(await this.$refs.resetForm.validate().catch(() => false))) return
      this.resetting = true
      try {
        await resetUserPassword(this.resetForm.userId, this.resetForm.password)
        this.$message.success('密码已重置')
        this.resetVisible = false
        this.resetForm.password = ''
      } catch {
        /* Reported by API layer. */
      } finally {
        this.resetting = false
      }
    },
    async changeStatus(user) {
      if (this.saving || user.status === 'LOCKED' || !this.can('system.user.disable')) return
      const status = user.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'
      const reason = await requestReason(
        this,
        (status === 'DISABLED' ? '停用' : '启用') + '用户“' + user.displayName + '”',
        '停用将使用户会话和权限失效；启用会恢复账号使用。请填写操作原因。'
      )
      if (!reason) return
      this.saving = true
      try {
        await setUserStatus(user.userId, { status, reason })
        this.$message.success('用户状态已更新')
        await this.loadUsers()
      } catch {
        /* Reported by API layer. */
      } finally {
        this.saving = false
      }
    },
    async unlock(user) {
      if (this.saving || !this.can('system.user.unlock')) return
      const reason = await requestReason(
        this,
        '解锁用户“' + user.displayName + '”',
        '解锁后用户可重新登录，请填写解锁原因。'
      )
      if (!reason) return
      this.saving = true
      try {
        await unlockUser(user.userId, reason)
        this.$message.success('用户已解锁')
        await this.loadUsers()
      } catch {
        /* Reported by API layer. */
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style lang="scss" scoped>
.page-container {
  padding: 20px;
}
.toolbar {
  display: flex;
  gap: 10px;
  margin-bottom: 16px;
}
.toolbar .el-input {
  width: 240px;
}
.pagination {
  margin-top: 16px;
  text-align: right;
}
.password-hint {
  margin-top: 4px;
  color: #909399;
  font-size: 12px;
  line-height: 1.5;
}
</style>
