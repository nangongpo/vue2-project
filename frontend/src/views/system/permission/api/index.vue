<template>
  <div class="api-page">
    <el-card shadow="never">
      <el-form :inline="true" :model="filters" @submit.native.prevent="search">
        <el-form-item label="关键词">
          <el-input
            v-model="filters.keyword"
            clearable
            placeholder="名称 / 权限码 / 路径"
            @keyup.enter.native="search" />
        </el-form-item>
        <el-form-item label="方法">
          <el-select v-model="filters.method" clearable placeholder="全部方法">
            <el-option v-for="method in methods" :key="method" :label="method" :value="method" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="filters.status" clearable placeholder="全部状态">
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button v-permission="'system.api.read'" type="primary" @click="search"
            >查询</el-button
          >
          <el-button @click="reset">重置</el-button>
          <el-button v-permission="'system.api.create'" @click="openForm()">新增接口</el-button>
        </el-form-item>
      </el-form>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <el-table v-loading="loading" :data="items" border stripe>
        <el-table-column prop="name" label="接口名称" min-width="180" />
        <el-table-column prop="code" label="权限码" min-width="190" />
        <el-table-column prop="method" label="方法" width="90" />
        <el-table-column prop="path" label="请求路径" min-width="220" />
        <el-table-column prop="resource" label="资源" min-width="120" />
        <el-table-column prop="action" label="动作" width="120" />
        <el-table-column label="状态" width="85">
          <template slot-scope="{ row }"
            ><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'">{{
              row.status === 'ACTIVE' ? '启用' : '停用'
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column
          v-for="column in referenceColumns"
          :key="column.key"
          :label="column.label"
          width="100">
          <template slot-scope="{ row }">{{ referenceCount(row, column.key) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template slot-scope="{ row }">
            <el-button v-permission="'system.api.update'" type="text" @click="openForm(row)"
              >编辑</el-button
            >
            <el-button
              v-permission="'system.api.disable'"
              type="text"
              :disabled="saving"
              @click="changeStatus(row)"
              >{{ row.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
            >
            <el-button
              v-permission="'system.api.references'"
              type="text"
              @click="showReferences(row)"
              >引用</el-button
            >
            <el-button
              v-permission="'system.api.delete'"
              type="text"
              :disabled="saving || !can('system.api.references')"
              @click="showReferences(row, true)"
              >删除</el-button
            >
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        class="pagination"
        :current-page="page"
        :page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next"
        @current-change="changePage"
        @size-change="changeSize" />
    </el-card>
    <el-dialog
      :title="editingId ? '编辑接口' : '新增接口'"
      :visible.sync="dialogVisible"
      width="580px"
      :close-on-click-modal="false">
      <el-alert
        v-if="editingId"
        title="普通编辑仅可修改名称；权限码、方法和路径变更请提交授权审批，资源和动作不可修改。"
        type="info"
        :closable="false" />
      <el-form ref="apiForm" :model="form" :rules="rules" label-width="100px">
        <el-form-item label="接口名称" prop="name"
          ><el-input v-model.trim="form.name" maxlength="128"
        /></el-form-item>
        <el-form-item label="权限码" prop="code"
          ><el-input v-model.trim="form.code" :disabled="!!editingId" maxlength="128"
        /></el-form-item>
        <el-form-item label="方法" prop="method"
          ><el-select v-model="form.method" :disabled="!!editingId"
            ><el-option
              v-for="method in methods"
              :key="method"
              :label="method"
              :value="method" /></el-select
        ></el-form-item>
        <el-form-item label="请求路径" prop="path"
          ><el-input
            v-model.trim="form.path"
            :disabled="!!editingId"
            maxlength="255"
            placeholder="/api/v1/orders/:id"
        /></el-form-item>
        <el-form-item label="资源" prop="resource"
          ><el-input v-model.trim="form.resource" :disabled="!!editingId" maxlength="128"
        /></el-form-item>
        <el-form-item label="动作" prop="action"
          ><el-input
            v-model.trim="form.action"
            :disabled="!!editingId"
            maxlength="64"
            placeholder="read / create / update / delete"
        /></el-form-item>
      </el-form>
      <span slot="footer"
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submit">保存</el-button></span
      >
    </el-dialog>
    <el-dialog
      :title="`${deleting ? '删除前检查引用' : '接口引用'}：${
        referenceApi ? referenceApi.name : ''
      }`"
      :visible.sync="referencesVisible"
      width="640px">
      <div v-loading="referencesLoading">
        <el-alert v-if="referencesError" :title="referencesError" type="error" :closable="false" />
        <template v-if="references">
          <el-alert
            :title="
              referenced
                ? '存在引用或引用信息不完整，禁止删除。可停用接口或先解除引用。'
                : '未被页面、按钮或角色引用。'
            "
            :type="referenced ? 'warning' : 'success'"
            :closable="false" />
          <section v-for="column in referenceColumns" :key="column.key">
            <h4>{{ column.label }}（{{ (references[column.key] || []).length }}）</h4>
            <el-tag
              v-for="item in references[column.key] || []"
              :key="item.id || item.roleId"
              class="reference-tag"
              >{{ item.name }} · {{ item.id || item.roleId }}</el-tag
            >
            <span v-if="!(references[column.key] || []).length">无</span>
          </section>
        </template>
      </div>
      <span slot="footer">
        <el-button @click="referencesVisible = false">关闭</el-button>
        <el-button
          v-if="deleting"
          v-permission="'system.api.delete'"
          type="danger"
          :disabled="referenced || referencesLoading || !!referencesError"
          :loading="saving"
          @click="remove"
          >确认删除</el-button
        >
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {
  getPermissionApis,
  createPermissionApi,
  updatePermissionApi,
  setPermissionApiStatus,
  getPermissionApiReferences,
  deletePermissionApi,
} from '@/api/admin'
import { HTTP_METHODS, requiredText, hasReferences } from '../utils'

const emptyForm = () => ({
  code: '',
  name: '',
  method: 'GET',
  path: '',
  resource: '',
  action: 'read',
})
export default {
  name: 'SystemPermissionApi',
  data() {
    return {
      methods: HTTP_METHODS,
      filters: { keyword: '', method: '', status: '' },
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      loading: false,
      loadError: '',
      requestId: 0,
      saving: false,
      dialogVisible: false,
      editingId: null,
      form: emptyForm(),
      referencesVisible: false,
      referencesLoading: false,
      referencesError: '',
      references: null,
      referenceApi: null,
      deleting: false,
      referenceRequestId: 0,
      referenceColumns: [
        { key: 'functions', label: '页面引用' },
        { key: 'buttons', label: '按钮引用' },
        { key: 'roles', label: '角色授权' },
      ],
      rules: {
        name: requiredText('接口名称'),
        resource: requiredText('资源'),
        action: requiredText('动作'),
        method: requiredText('方法'),
        code: [
          ...requiredText('权限码'),
          {
            pattern: /^[a-z][a-z0-9_.:-]{1,127}$/,
            message: '使用小写字母开头的明确权限码',
            trigger: 'blur',
          },
        ],
        path: [
          ...requiredText('请求路径'),
          {
            pattern:
              /^\/api\/v1\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*\/?$/,
            message: '请输入 /api/v1/ 开头的路由模板，不允许通配符和查询参数',
            trigger: 'blur',
          },
        ],
      },
    }
  },
  computed: {
    referenced() {
      return hasReferences(this.references)
    },
  },
  created() {
    this.load()
  },
  methods: {
    can(code) {
      const permissions = this.$store.getters.menu_list || []
      return permissions.includes(code) || permissions.includes('*')
    },
    referenceCount(row, key) {
      const singular = { functions: 'function', buttons: 'button', roles: 'role' }[key]
      const relation = { functions: 'functionApis', buttons: 'buttonApis', roles: 'roles' }[key]
      return row.referenceCounts?.[key] ?? row[`${singular}Count`] ?? row._count?.[relation] ?? '—'
    },
    async load() {
      if (!this.can('system.api.read')) {
        this.loadError = '缺少接口查询权限'
        return
      }
      const requestId = ++this.requestId
      this.loading = true
      this.loadError = ''
      try {
        const result = await getPermissionApis({
          ...this.filters,
          keyword: this.filters.keyword.trim(),
          method: this.filters.method || undefined,
          status: this.filters.status || undefined,
          page: this.page,
          pageSize: this.pageSize,
        })
        if (requestId !== this.requestId) return
        this.items = result.items
        this.total = result.total
        this.page = result.page
        this.pageSize = result.pageSize
        if (!this.items.length && this.total && this.page > 1) {
          this.page = Math.ceil(this.total / this.pageSize)
          await this.load()
        }
      } catch (error) {
        if (requestId === this.requestId) {
          this.items = []
          this.total = 0
          this.loadError = error.message || '接口加载失败，请重试'
        }
      } finally {
        if (requestId === this.requestId) this.loading = false
      }
    },
    search() {
      this.page = 1
      this.load()
    },
    reset() {
      this.filters = { keyword: '', method: '', status: '' }
      this.search()
    },
    changePage(page) {
      this.page = page
      this.load()
    },
    changeSize(size) {
      this.pageSize = size
      this.search()
    },
    openForm(row) {
      this.editingId = row?.id || null
      this.form = row
        ? {
            code: row.code,
            name: row.name,
            method: row.method,
            path: row.path,
            resource: row.resource,
            action: row.action,
          }
        : emptyForm()
      this.dialogVisible = true
      this.$nextTick(() => this.$refs.apiForm?.clearValidate())
    },
    async submit() {
      if (this.saving || !this.can(this.editingId ? 'system.api.update' : 'system.api.create'))
        return
      if (!(await this.$refs.apiForm.validate().catch(() => false))) return
      this.saving = true
      try {
        const { name } = this.form
        const result = this.editingId
          ? await updatePermissionApi(this.editingId, { name })
          : await createPermissionApi({ ...this.form })
        this.dialogVisible = false
        this.$message.success(result?.status === 'REQUESTED' ? '接口变更已提交审批，审批执行后生效' : '接口已保存')
        await this.load()
      } catch {
        /* API layer reports the failure; keep the form for retry. */
      } finally {
        this.saving = false
      }
    },
    async changeStatus(row) {
      if (this.saving || !this.can('system.api.disable')) return
      const status = row.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      if (
        !(await this.$confirm(
          `${
            status === 'DISABLED'
              ? '停用后，引用此接口的页面、按钮和角色将无法调用该接口。'
              : '启用后，现有授权将恢复访问。'
          }确认${status === 'DISABLED' ? '停用' : '启用'}“${row.name}”？`,
          '接口状态变更',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        const result = await setPermissionApiStatus(row.id, status)
        this.$message.success(result?.status === 'REQUESTED' ? '状态变更已提交审批，审批执行后生效' : '状态已更新')
        await this.load()
      } catch {
        /* Reported by API layer. */
      } finally {
        this.saving = false
      }
    },
    async showReferences(row, deleting = false) {
      if (!this.can('system.api.references')) return
      const requestId = ++this.referenceRequestId
      this.referenceApi = row
      this.deleting = deleting
      this.references = null
      this.referencesError = ''
      this.referencesLoading = true
      this.referencesVisible = true
      try {
        const refs = await getPermissionApiReferences(row.id)
        if (requestId === this.referenceRequestId) this.references = refs
      } catch (error) {
        if (requestId === this.referenceRequestId)
          this.referencesError = error.message || '引用查询失败，禁止删除'
      } finally {
        if (requestId === this.referenceRequestId) this.referencesLoading = false
      }
    },
    async remove() {
      if (this.saving || this.referenced || !this.can('system.api.delete')) return
      const target = this.referenceApi
      if (
        !(await this.$confirm(
          `永久删除接口“${target.name}”（${target.method} ${target.path}）？此操作无法撤销。`,
          '确认删除',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        this.references = await getPermissionApiReferences(target.id)
        if (this.referenced) {
          this.$message.warning('引用关系已变化，禁止删除')
          return
        }
        const result = await deletePermissionApi(target.id)
        this.referencesVisible = false
        this.$message.success(result?.status === 'REQUESTED' ? '删除申请已提交审批，审批执行后生效' : '接口已删除')
        await this.load()
      } catch {
        /* Server also checks references atomically. */
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.api-page {
  padding: 20px;
}
.pagination {
  margin-top: 20px;
  text-align: right;
}
.reference-tag {
  margin: 4px;
  white-space: normal;
  height: auto;
}
.el-alert {
  margin-bottom: 16px;
}
</style>
