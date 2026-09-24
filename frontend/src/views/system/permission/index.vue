<template>
  <div class="permission-page">
    <el-card v-loading="loading" shadow="never">
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <div class="permission-layout">
        <aside class="page-panel">
          <div class="toolbar">
            <el-button
              v-permission="'system.page.create'"
              type="primary"
              size="small"
              @click="openPage(null)"
              >新增根页面</el-button
            >
            <el-button v-permission="'system.page.read'" size="small" @click="loadData"
              >刷新</el-button
            >
          </div>
          <el-input v-model="pageKeyword" clearable placeholder="搜索名称 / 权限码 / 路由" />
          <el-tree
            ref="pageTree"
            class="page-tree"
            node-key="id"
            highlight-current
            default-expand-all
            :data="pageTreeData"
            :props="{ label: 'name' }"
            :expand-on-click-node="false"
            @node-click="selectFunction">
            <span slot-scope="{ data }" class="tree-node"
              ><span>{{ data.name }}</span
              ><el-tag :type="data.status === 'ACTIVE' ? 'success' : 'info'" size="mini">{{
                data.status === 'ACTIVE' ? '启用' : '停用'
              }}</el-tag></span
            >
          </el-tree>
        </aside>
        <section class="detail-panel">
          <template v-if="selectedFunction">
            <div class="toolbar">
              <h3>{{ selectedFunction.name }}</h3>
              <el-button
                v-permission="'system.page.create'"
                type="text"
                :disabled="selectedFunction.status !== 'ACTIVE'"
                @click="openPage(selectedFunction.id)"
                >新增子页面</el-button
              >
              <el-button
                v-permission="'system.page.update'"
                type="text"
                @click="openPage(null, selectedFunction)"
                >编辑页面</el-button
              >
              <el-button
                v-permission="'system.page.disable'"
                type="text"
                :disabled="saving"
                @click="changeStatus('page', selectedFunction)"
                >{{ selectedFunction.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
              >
            </div>
            <el-descriptions :column="2" border size="small">
              <el-descriptions-item label="权限码">{{
                selectedFunction.code
              }}</el-descriptions-item>
              <el-descriptions-item label="路由">{{ selectedFunction.route }}</el-descriptions-item>
              <el-descriptions-item label="组件">{{
                selectedFunction.component || '目录节点'
              }}</el-descriptions-item>
              <el-descriptions-item label="父页面">{{ parentName }}</el-descriptions-item>
              <el-descriptions-item label="状态">{{
                selectedFunction.status === 'ACTIVE' ? '启用' : '停用'
              }}</el-descriptions-item>
              <el-descriptions-item label="排序">{{ selectedFunction.sort }}</el-descriptions-item>
            </el-descriptions>
            <el-tabs v-model="activeTab">
              <el-tab-pane label="页面基础接口" name="apis">
                <p class="muted">
                  仅允许启用的 GET/read 接口。写操作、导出和审批接口应绑定具体按钮。
                </p>
                <el-alert
                  v-if="optionsReady && unavailablePageApis.length"
                  :title="
                    '原绑定中有 ' +
                    unavailablePageApis.length +
                    ' 个接口已停用或不符合 GET/read 限制；保存将解除这些绑定。'
                  "
                  type="warning"
                  :closable="false" />
                <p v-for="api in boundPageApis" :key="api.id" class="muted">
                  当前绑定：{{ apiLabel(api) }}
                </p>
                <el-select
                  v-model="pageApiIds"
                  multiple
                  filterable
                  class="full-width"
                  :disabled="!can('system.page.bind-api') || !optionsReady"
                  placeholder="选择页面基础接口">
                  <el-option
                    v-for="api in readApis"
                    :key="api.id"
                    :label="apiLabel(api)"
                    :value="api.id" />
                </el-select>
                <el-button
                  v-permission="'system.page.bind-api'"
                  class="save-button"
                  type="primary"
                  :disabled="!optionsReady"
                  :loading="saving"
                  @click="saveBindings('page')"
                  >保存页面接口</el-button
                >
              </el-tab-pane>
              <el-tab-pane v-if="can('system.button.read')" label="按钮与操作接口" name="buttons">
                <div class="toolbar">
                  <el-button
                    v-permission="'system.button.create'"
                    type="primary"
                    size="small"
                    @click="openButton()"
                    >新增按钮</el-button
                  ><span class="muted">按钮与 API 授权均须由角色独立选择。</span>
                </div>
                <el-table :data="selectedFunction.buttons || []" border stripe>
                  <el-table-column prop="name" label="名称" min-width="110" />
                  <el-table-column prop="label" label="显示文本" min-width="110" />
                  <el-table-column prop="code" label="权限码" min-width="170" />
                  <el-table-column prop="sort" label="排序" width="65" />
                  <el-table-column label="状态" width="80"
                    ><template slot-scope="{ row }">{{
                      row.status === 'ACTIVE' ? '启用' : '停用'
                    }}</template></el-table-column
                  >
                  <el-table-column label="绑定接口" min-width="180"
                    ><template slot-scope="{ row }"
                      ><el-tag
                        v-for="api in boundApis(row)"
                        :key="api.id"
                        class="api-tag"
                        size="mini"
                        >{{ api.code }}</el-tag
                      ><span v-if="!boundApis(row).length">未绑定</span></template
                    ></el-table-column
                  >
                  <el-table-column label="操作" width="190"
                    ><template slot-scope="{ row }">
                      <el-button
                        v-permission="'system.button.update'"
                        type="text"
                        @click="openButton(row)"
                        >编辑</el-button
                      >
                      <el-button
                        v-permission="'system.button.bind-api'"
                        type="text"
                        @click="openBinding(row)"
                        >绑定接口</el-button
                      >
                      <el-button
                        v-permission="'system.button.disable'"
                        type="text"
                        :disabled="saving"
                        @click="changeStatus('button', row)"
                        >{{ row.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
                      >
                    </template></el-table-column
                  >
                </el-table>
              </el-tab-pane>
            </el-tabs>
          </template>
          <el-empty v-else description="请选择或新增页面" />
        </section>
      </div>
    </el-card>
    <el-dialog
      :title="editingPage ? '编辑页面' : '新增页面'"
      :visible.sync="pageDialogVisible"
      width="580px"
      :close-on-click-modal="false">
      <el-form ref="pageForm" :model="pageForm" :rules="pageRules" label-width="100px">
        <el-form-item label="上级页面"
          ><el-select
            v-model="pageForm.parentId"
            clearable
            filterable
            class="full-width"
            placeholder="根页面"
            ><el-option
              v-for="item in parentOptions"
              :key="item.id"
              :label="item.name + ' (' + item.route + ')'"
              :value="item.id" /></el-select
        ></el-form-item>
        <el-form-item label="页面名称" prop="name"
          ><el-input v-model.trim="pageForm.name" maxlength="128"
        /></el-form-item>
        <el-form-item label="权限码" prop="code"
          ><el-input v-model.trim="pageForm.code" :disabled="!!editingPage" maxlength="128"
        /></el-form-item>
        <el-form-item label="前端路由" prop="route"
          ><el-input v-model.trim="pageForm.route" maxlength="255" placeholder="/system/order"
        /></el-form-item>
        <el-form-item label="组件路径"
          ><el-input v-model.trim="pageForm.component" maxlength="255" placeholder="目录节点可留空"
        /></el-form-item>
        <el-form-item label="排序"
          ><el-input-number v-model="pageForm.sort" :min="0" :max="9999" :precision="0"
        /></el-form-item>
      </el-form>
      <span slot="footer"
        ><el-button @click="pageDialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submitPage">保存</el-button></span
      >
    </el-dialog>
    <el-dialog
      :title="editingButton ? '编辑按钮' : '新增按钮'"
      :visible.sync="buttonDialogVisible"
      width="540px"
      :close-on-click-modal="false">
      <el-form ref="buttonForm" :model="buttonForm" :rules="buttonRules" label-width="100px">
        <el-form-item label="权限码" prop="code"
          ><el-input v-model.trim="buttonForm.code" :disabled="!!editingButton" maxlength="128"
        /></el-form-item>
        <el-form-item label="按钮名称" prop="name"
          ><el-input v-model.trim="buttonForm.name" maxlength="128"
        /></el-form-item>
        <el-form-item label="显示文本" prop="label"
          ><el-input v-model.trim="buttonForm.label" maxlength="128"
        /></el-form-item>
        <el-form-item label="排序"
          ><el-input-number v-model="buttonForm.sort" :min="0" :max="9999" :precision="0"
        /></el-form-item>
      </el-form>
      <span slot="footer"
        ><el-button @click="buttonDialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submitButton">保存</el-button></span
      >
    </el-dialog>
    <el-dialog
      title="绑定按钮操作接口"
      :visible.sync="bindingVisible"
      width="620px"
      :close-on-click-modal="false">
      <p>{{ bindingButton ? bindingButton.name : '' }}</p>
      <p v-for="api in boundApis(bindingButton)" :key="api.id" class="muted">
        当前绑定：{{ apiLabel(api) }}
      </p>
      <el-alert
        v-if="optionsReady && unavailableButtonApis.length"
        :title="
          '有 ' + unavailableButtonApis.length + ' 个原绑定接口不再可选，保存将解除这些绑定。'
        "
        type="warning"
        :closable="false" />
      <el-select
        v-model="buttonApiIds"
        multiple
        filterable
        class="full-width"
        :disabled="!optionsReady"
        ><el-option v-for="api in apis" :key="api.id" :label="apiLabel(api)" :value="api.id"
      /></el-select>
      <span slot="footer"
        ><el-button @click="bindingVisible = false">取消</el-button
        ><el-button
          v-permission="'system.button.bind-api'"
          type="primary"
          :disabled="!optionsReady"
          :loading="saving"
          @click="saveBindings('button')"
          >保存绑定</el-button
        ></span
      >
    </el-dialog>
  </div>
</template>

<script>
import {
  createPermissionButton,
  createPermissionFunction,
  getPermissionApiOptions,
  getPermissionFunctions,
  mapButtonApis,
  mapFunctionApis,
  updatePermissionFunction,
  updatePermissionButton,
  setPermissionFunctionStatus,
  setPermissionButtonStatus,
} from '@/api/admin'
import {
  activeApis,
  pageApis,
  boundApis,
  selectableIds,
  descendantIds,
  pageTree,
  requiredText,
  grantChanges,
} from './utils'
export default {
  name: 'SystemPermission',
  data() {
    return {
      loading: false,
      saving: false,
      loadError: '',
      functions: [],
      apis: [],
      optionsReady: false,
      selectedId: null,
      activeTab: 'apis',
      pageKeyword: '',
      pageApiIds: [],
      pageDialogVisible: false,
      editingPage: null,
      pageForm: { parentId: null, name: '', code: '', route: '', component: '', sort: 0 },
      buttonDialogVisible: false,
      editingButton: null,
      buttonFunctionId: null,
      buttonForm: { code: '', name: '', label: '', sort: 0 },
      bindingVisible: false,
      bindingButton: null,
      buttonApiIds: [],
      pageRules: {
        name: requiredText('页面名称'),
        code: requiredText('权限码'),
        route: [
          ...requiredText('路由'),
          { pattern: /^\//, message: '路由须以 / 开头', trigger: 'blur' },
        ],
      },
      buttonRules: {
        code: requiredText('权限码'),
        name: requiredText('按钮名称'),
        label: requiredText('显示文本'),
      },
    }
  },
  computed: {
    selectedFunction() {
      return this.functions.find((item) => item.id === this.selectedId) || null
    },
    pageTreeData() {
      return pageTree(this.functions, this.pageKeyword)
    },
    parentOptions() {
      const excluded = descendantIds(this.functions, this.editingPage?.id)
      return this.functions.filter((item) => item.status === 'ACTIVE' && !excluded.has(item.id))
    },
    parentName() {
      return (
        this.functions.find((item) => item.id === this.selectedFunction?.parentId)?.name || '根页面'
      )
    },
    readApis() {
      return pageApis(this.apis)
    },
    boundPageApis() {
      return boundApis(this.selectedFunction)
    },
    unavailablePageApis() {
      return this.boundPageApis.filter(
        (api) => !this.readApis.some((option) => option.id === api.id)
      )
    },
    unavailableButtonApis() {
      return boundApis(this.bindingButton).filter(
        (api) => !this.apis.some((option) => option.id === api.id)
      )
    },
  },
  created() {
    this.loadData()
  },
  methods: {
    boundApis,
    can(code) {
      const permissions = this.$store.getters.menu_list || []
      return permissions.includes(code) || permissions.includes('*')
    },
    async loadData() {
      if (this.loading) return
      if (!this.can('system.page.read')) {
        this.loadError = '缺少页面查询权限'
        return
      }
      this.loading = true
      this.loadError = ''
      this.optionsReady = false
      try {
        const results = await Promise.allSettled([
          getPermissionFunctions(),
          this.can('system.api.options') ? getPermissionApiOptions() : Promise.resolve([]),
        ])
        if (results[0].status === 'fulfilled') {
          this.functions = results[0].value || []
          if (!this.functions.some((item) => item.id === this.selectedId))
            this.selectedId = this.functions[0]?.id || null
        } else {
          this.functions = []
          this.selectedId = null
          this.loadError = results[0].reason.message || '页面加载失败'
        }
        if (results[1].status === 'fulfilled') {
          this.apis = activeApis(results[1].value || [])
          this.optionsReady = this.can('system.api.options')
        } else {
          this.apis = []
          this.loadError = this.loadError || '接口选项加载失败，暂不可保存接口绑定；请刷新重试。'
        }
        if (!this.can('system.api.options'))
          this.loadError = this.loadError || '缺少接口选项查询权限，无法配置接口绑定。'
        this.syncPageApis()
        this.$nextTick(() => this.$refs.pageTree?.setCurrentKey(this.selectedId))
      } finally {
        this.loading = false
      }
    },
    selectFunction(item) {
      if (this.saving) return
      this.selectedId = item.id
      this.syncPageApis()
    },
    syncPageApis() {
      this.pageApiIds = selectableIds(
        this.boundPageApis.map((api) => api.id),
        this.readApis
      )
    },
    apiLabel(api) {
      return api.name + ' (' + api.method + ' ' + api.path + ')'
    },
    openPage(parentId, page = null) {
      this.editingPage = page
      this.pageForm = page
        ? {
            name: page.name,
            code: page.code,
            route: page.route,
            component: page.component || '',
            parentId: page.parentId || null,
            sort: page.sort || 0,
          }
        : { parentId, name: '', code: '', route: '', component: '', sort: 0 }
      this.pageDialogVisible = true
      this.$nextTick(() => this.$refs.pageForm?.clearValidate())
    },
    async submitPage() {
      if (this.saving || !this.can(this.editingPage ? 'system.page.update' : 'system.page.create'))
        return
      if (!(await this.$refs.pageForm.validate().catch(() => false))) return
      this.saving = true
      try {
        const { name, route, component, sort } = this.pageForm
        const data = { name, route, component, sort, parentId: this.pageForm.parentId || null }
        if (this.editingPage) await updatePermissionFunction(this.editingPage.id, data)
        else {
          const created = await createPermissionFunction({
            ...data,
            code: this.pageForm.code,
            apiIds: [],
          })
          this.selectedId = created.id
        }
        this.pageDialogVisible = false
        this.$message.success('页面已保存')
        await this.loadData()
      } catch {
        /* Keep the form for retry. */
      } finally {
        this.saving = false
      }
    },
    openButton(button = null) {
      this.editingButton = button
      this.buttonFunctionId = this.selectedId
      this.buttonForm = button
        ? { code: button.code, name: button.name, label: button.label, sort: button.sort || 0 }
        : { code: '', name: '', label: '', sort: 0 }
      this.buttonDialogVisible = true
      this.$nextTick(() => this.$refs.buttonForm?.clearValidate())
    },
    async submitButton() {
      if (
        this.saving ||
        !this.can(this.editingButton ? 'system.button.update' : 'system.button.create')
      )
        return
      if (!(await this.$refs.buttonForm.validate().catch(() => false))) return
      this.saving = true
      try {
        const { name, label, sort } = this.buttonForm
        if (this.editingButton)
          await updatePermissionButton(this.editingButton.id, { name, label, sort })
        else
          await createPermissionButton({
            name,
            label,
            sort,
            code: this.buttonForm.code,
            functionId: this.buttonFunctionId,
            apiIds: [],
          })
        this.buttonDialogVisible = false
        this.$message.success('按钮已保存')
        await this.loadData()
      } catch {
        /* Keep the form for retry. */
      } finally {
        this.saving = false
      }
    },
    openBinding(button) {
      this.bindingButton = button
      this.buttonApiIds = selectableIds(
        boundApis(button).map((api) => api.id),
        this.apis
      )
      this.bindingVisible = true
    },
    async saveBindings(kind) {
      const target = kind === 'page' ? this.selectedFunction : this.bindingButton
      if (!target || this.saving || !this.optionsReady || !this.can('system.' + kind + '.bind-api'))
        return
      const ids = selectableIds(
        kind === 'page' ? this.pageApiIds : this.buttonApiIds,
        kind === 'page' ? this.readApis : this.apis
      )
      const changes = grantChanges(
        boundApis(target).map((api) => api.id),
        ids
      )
      if (
        !(await this.$confirm(
          '新增绑定 ' +
            changes.added.length +
            ' 个，解除绑定 ' +
            changes.removed.length +
            ' 个（包括不再可选的原绑定）。确认保存？',
          '接口绑定影响',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        await (kind === 'page' ? mapFunctionApis : mapButtonApis)(target.id, ids)
        this.bindingVisible = false
        this.$message.success('接口绑定已保存')
        await this.loadData()
      } catch {
        /* Reported by API layer. */
      } finally {
        this.saving = false
      }
    },
    async changeStatus(kind, item) {
      if (this.saving || !this.can('system.' + kind + '.disable')) return
      const status = item.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const impact =
        kind === 'page'
          ? '涉及 ' +
            (descendantIds(this.functions, item.id).size - 1) +
            ' 个子页面、' +
            (item.buttons || []).length +
            ' 个按钮。'
          : '涉及 ' + boundApis(item).length + ' 个操作接口绑定。'
      if (
        !(await this.$confirm(
          impact +
            (status === 'DISABLED'
              ? '停用后该权限将失效。确认停用？'
              : '启用后现有授权将恢复。确认启用？'),
          item.name,
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        await (kind === 'page' ? setPermissionFunctionStatus : setPermissionButtonStatus)(
          item.id,
          status
        )
        this.$message.success('状态已更新')
        await this.loadData()
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
.permission-page {
  padding: 20px;
}
.permission-layout {
  display: flex;
  gap: 24px;
  min-height: 520px;
}
.page-panel {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid #ebeef5;
  padding-right: 20px;
}
.detail-panel {
  flex: 1;
  min-width: 0;
}
.toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}
.toolbar h3 {
  margin-right: auto;
}
.page-tree {
  margin-top: 16px;
}
.tree-node {
  display: flex;
  gap: 8px;
  align-items: center;
}
.full-width {
  width: 100%;
}
.muted {
  color: #909399;
  font-size: 13px;
}
.api-tag {
  margin: 3px;
}
.save-button {
  margin-top: 16px;
}
.el-alert {
  margin-bottom: 16px;
}
@media (max-width: 900px) {
  .permission-layout {
    flex-direction: column;
  }
  .page-panel {
    width: auto;
    border-right: 0;
  }
}
</style>
