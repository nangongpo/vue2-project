<template>
  <div class="permission-page">
    <el-card v-loading="loading" class="permission-card" shadow="never">
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" />
      <div class="permission-layout">
        <page-tree-panel
          ref="pageTreePanel"
          :tree-data="pageTreeData"
          :keyword.sync="pageKeyword"
          :loading="loading"
          @create="openPage(null)"
          @refresh="loadData"
          @select="selectFunction" />

        <section class="detail-panel">
          <template v-if="selectedFunction">
            <div class="breadcrumb">
              <span>权限管理</span><i class="el-icon-arrow-right" />{{ selectedFunction.name }}
            </div>
            <div class="detail-header">
              <div class="title-wrap">
                <h2>{{ selectedFunction.name }}</h2>
                <el-tag :type="selectedFunction.status === 'ACTIVE' ? 'success' : 'info'">{{
                  selectedFunction.status === 'ACTIVE' ? '启用' : '停用'
                }}</el-tag>
              </div>
              <div class="header-actions">
                <el-button
                  v-permission="'system.page.create'"
                  type="text"
                  :disabled="selectedFunction.status !== 'ACTIVE'"
                  @click="openPage(selectedFunction.id)"
                  >新增子页面</el-button
                ><el-button
                  v-permission="'system.page.update'"
                  @click="openPage(null, selectedFunction)"
                  >编辑</el-button
                ><el-button
                  v-permission="'system.page.disable'"
                  type="danger"
                  plain
                  :disabled="saving"
                  @click="changeStatus('page', selectedFunction)"
                  >{{ selectedFunction.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
                >
              </div>
            </div>
            <el-descriptions class="page-detail" :column="3" border size="small">
              <el-descriptions-item label="权限码">{{ selectedFunction.code }}</el-descriptions-item
              ><el-descriptions-item label="路由">{{ selectedFunction.route }}</el-descriptions-item
              ><el-descriptions-item label="组件">{{
                selectedFunction.component || '目录节点'
              }}</el-descriptions-item
              ><el-descriptions-item label="父页面">{{ parentName }}</el-descriptions-item
              ><el-descriptions-item label="状态">{{
                selectedFunction.status === 'ACTIVE' ? '启用' : '停用'
              }}</el-descriptions-item
              ><el-descriptions-item label="排序">{{ selectedFunction.sort }}</el-descriptions-item>
            </el-descriptions>

            <div class="permission-tabs-row">
              <el-tabs v-model="activeTab" class="permission-tabs" @tab-click="rememberTab">
                <el-tab-pane label="页面基础接口" name="apis">
                  <div class="section-card page-api-card">
                    <div class="section-title">页面基础接口</div>
                    <p class="muted">
                      仅允许启用的 GET/read 接口。写操作、导出和审批接口应绑定具体按钮。
                    </p>
                    <el-alert
                      v-if="optionsReady && unavailablePageApis.length"
                      :title="
                        '有 ' +
                        unavailablePageApis.length +
                        ' 个历史绑定接口已停用或不符合 GET/read 限制，保存时将解除绑定。'
                      "
                      type="warning"
                      :closable="false" /><el-select
                      v-model="pageApiIds"
                      multiple
                      filterable
                      class="full-width"
                      :disabled="!can('system.page.bind-api') || !optionsReady"
                      placeholder="选择页面基础接口"
                      ><el-option
                        v-for="api in readApis"
                        :key="api.id"
                        :label="apiLabel(api)"
                        :value="api.id"
                    /></el-select>
                    <div class="form-actions">
                      <el-button
                        v-permission="'system.page.bind-api'"
                        type="primary"
                        :disabled="!optionsReady"
                        :loading="saving"
                        @click="saveBindings('page')"
                        >保存页面接口</el-button
                      >
                    </div>
                  </div>
                </el-tab-pane>
                <el-tab-pane v-if="can('system.button.read')" label="按钮与操作接口" name="buttons">
                  <div class="button-workspace">
                    <div class="button-toolbar">
                      <el-button
                        v-permission="'system.button.create'"
                        type="primary"
                        icon="el-icon-plus"
                        @click="openButton()"
                        >新增按钮</el-button
                      ><el-input
                        v-model="buttonKeyword"
                        clearable
                        prefix-icon="el-icon-search"
                        class="button-search"
                        placeholder="搜索权限名称 / 权限码" /><el-select
                        v-model="buttonStatus"
                        clearable
                        class="button-filter"
                        placeholder="全部状态"
                        ><el-option label="启用" value="ACTIVE" /><el-option
                          label="停用"
                          value="DISABLED" /></el-select
                      ><el-select
                        v-model="buttonBindingFilter"
                        clearable
                        class="button-filter"
                        placeholder="全部绑定状态"
                        ><el-option label="已绑定接口" value="BOUND" /><el-option
                          label="待配置"
                          value="UNBOUND" /></el-select
                      ><span class="button-summary"
                        >{{ buttonTotal }} 个按钮 · {{ buttonBoundCount }} 个已绑定</span
                      >
                    </div>
                    <el-table
                      :data="filteredButtons"
                      border
                      stripe
                      class="button-table"
                      empty-text="暂无按钮">
                      <el-table-column
                        prop="label"
                        label="显示文本"
                        min-width="100" /><el-table-column
                        prop="name"
                        label="按钮名称"
                        min-width="120" /><el-table-column
                        prop="code"
                        label="权限码"
                        min-width="180" />
                      <el-table-column label="绑定接口" min-width="210"
                        ><template slot-scope="{ row }"
                          ><template v-if="boundApis(row).length"
                            ><span
                              v-for="api in boundApis(row).slice(0, 2)"
                              :key="api.id"
                              class="api-binding"
                              ><el-tag
                                :type="methodTagType(api.method)"
                                size="mini"
                                class="method-tag"
                                >{{ api.method }}</el-tag
                              ><span class="api-path">{{ api.path || '路径未配置' }}</span></span
                            ><span v-if="boundApis(row).length > 2" class="more-apis"
                              >+{{ boundApis(row).length - 2 }}</span
                            ></template
                          ><span v-else class="muted">待配置</span></template
                        ></el-table-column
                      >
                      <el-table-column label="状态" width="82"
                        ><template slot-scope="{ row }"
                          ><el-tag
                            :type="row.status === 'ACTIVE' ? 'success' : 'info'"
                            size="mini"
                            >{{ row.status === 'ACTIVE' ? '启用' : '停用' }}</el-tag
                          ></template
                        ></el-table-column
                      >
                      <el-table-column label="操作" width="190" fixed="right"
                        ><template slot-scope="{ row }"
                          ><el-button
                            v-permission="'system.button.update'"
                            type="text"
                            @click="openButton(row)"
                            >编辑</el-button
                          ><el-button
                            v-permission="'system.button.bind-api'"
                            type="text"
                            @click="openBinding(row)"
                            >绑定接口</el-button
                          ><el-button
                            v-permission="'system.button.disable'"
                            type="text"
                            :class="{ 'text-danger': row.status === 'ACTIVE' }"
                            :disabled="saving"
                            @click="changeStatus('button', row)"
                            >{{ row.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
                          ></template
                        ></el-table-column
                      >
                    </el-table>
                    <div class="table-footer">共 {{ buttonTotal }} 条</div>
                  </div>
                </el-tab-pane>
                <el-tab-pane
                  v-if="can('system.permission.field.read')"
                  label="数据字段权限"
                  name="fields">
                  <div class="section-card data-field-card">
                    <div class="data-field-heading">
                      <div>
                        <div class="section-title">数据字段权限</div>
                        <p class="muted">
                          控制当前数据资源的字段返回和写入权限，字段权限由角色独立授权。
                        </p>
                      </div>
                      <el-button
                        icon="el-icon-refresh"
                        :loading="dataFieldsLoading"
                        @click="loadDataFields">
                        刷新
                      </el-button>
                    </div>
                    <el-table
                      v-loading="dataFieldsLoading"
                      :data="dataFields"
                      border
                      stripe
                      class="data-field-table"
                      empty-text="当前页面暂无数据字段定义">
                      <el-table-column prop="name" label="字段名称" min-width="120" />
                      <el-table-column prop="field" label="字段名" min-width="150" />
                      <el-table-column prop="dataType" label="类型" width="100" />
                      <el-table-column label="读取权限" min-width="230">
                        <template slot-scope="{ row }">
                          <el-tag size="mini" type="success">{{
                            row.readPermission && row.readPermission.code
                          }}</el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="写入权限" min-width="230">
                        <template slot-scope="{ row }">
                          <el-tag v-if="row.writePermission" size="mini">{{
                            row.writePermission.code
                          }}</el-tag>
                          <span v-else class="muted">只读</span>
                        </template>
                      </el-table-column>
                      <el-table-column label="风险等级" width="100">
                        <template slot-scope="{ row }">
                          <el-tag :type="riskTagType(row.riskLevel)" size="mini">{{
                            row.riskLevel
                          }}</el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="状态" width="82">
                        <template slot-scope="{ row }">
                          <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="mini">
                            {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
                          </el-tag>
                        </template>
                      </el-table-column>
                      <el-table-column label="操作" width="100" fixed="right">
                        <template slot-scope="{ row }">
                          <el-button
                            v-permission="'system.permission.field.update'"
                            type="text"
                            :disabled="saving"
                            @click="openDataField(row)">
                            编辑
                          </el-button>
                          <el-button
                            v-permission="'system.permission.field.disable'"
                            type="text"
                            :disabled="saving"
                            @click="changeDataFieldStatus(row)">
                            {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
                          </el-button>
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>
                </el-tab-pane>
              </el-tabs>
              <div class="tabs-help">
                <el-popover placement="top-end" width="300" trigger="click">
                  <p class="tip-content">
                    按钮权限与操作接口需由角色独立授权，页面基础接口仅用于页面加载。
                  </p>
                  <el-button
                    slot="reference"
                    class="tip-trigger"
                    icon="el-icon-info"
                    circle
                    title="授权说明" />
                </el-popover>
              </div>
            </div>
          </template>
          <el-empty v-else description="请选择或新增页面" />
        </section>
      </div>
    </el-card>

    <el-dialog
      :title="editingPage ? '编辑页面' : '新增页面'"
      :visible.sync="pageDialogVisible"
      width="580px"
      :close-on-click-modal="false"
      ><el-form ref="pageForm" :model="pageForm" :rules="pageRules" label-width="100px"
        ><el-form-item label="上级页面"
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
              :value="item.id" /></el-select></el-form-item
        ><el-form-item label="页面名称" prop="name"
          ><el-input v-model.trim="pageForm.name" maxlength="128" /></el-form-item
        ><el-form-item label="权限码" prop="code"
          ><el-input
            v-model.trim="pageForm.code"
            :disabled="!!editingPage"
            maxlength="128" /></el-form-item
        ><el-form-item label="前端路由" prop="route"
          ><el-input
            v-model.trim="pageForm.route"
            maxlength="255"
            placeholder="/system/order" /></el-form-item
        ><el-form-item label="组件路径"
          ><el-input
            v-model.trim="pageForm.component"
            maxlength="255"
            placeholder="目录节点可留空" /></el-form-item
        ><el-form-item label="排序"
          ><el-input-number
            v-model="pageForm.sort"
            :min="0"
            :max="9999"
            :precision="0" /></el-form-item></el-form
      ><span slot="footer"
        ><el-button @click="pageDialogVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submitPage">保存</el-button></span
      ></el-dialog
    >

    <el-drawer
      :title="editingButton ? '编辑按钮' : '新增按钮'"
      :visible.sync="buttonDrawerVisible"
      direction="rtl"
      size="380px"
      ><div class="button-drawer-body">
        <el-form ref="buttonForm" :model="buttonForm" :rules="buttonRules" label-position="top"
          ><div class="drawer-section-title">基本信息</div>
          <el-form-item label="按钮名称" prop="name"
            ><el-input
              v-model.trim="buttonForm.name"
              maxlength="128"
              placeholder="例如 user.create" /></el-form-item
          ><el-form-item label="显示文本" prop="label"
            ><el-input
              v-model.trim="buttonForm.label"
              maxlength="128"
              placeholder="例如 新增用户" /></el-form-item
          ><el-form-item label="权限码" prop="code"
            ><el-input
              v-model.trim="buttonForm.code"
              :disabled="!!editingButton"
              maxlength="128" /></el-form-item
          ><el-form-item label="状态"
            ><el-select v-model="buttonForm.status" class="full-width" disabled
              ><el-option label="启用" value="ACTIVE" /><el-option
                label="停用"
                value="DISABLED" /></el-select
          ></el-form-item>
          <div class="drawer-section-title api-section-title">
            操作接口 <span class="section-line" />
          </div>
          <div v-if="boundApis(editingButton).length" class="drawer-api-list">
            <div v-for="api in boundApis(editingButton)" :key="api.id" class="drawer-api-item">
              <el-tag :type="methodTagType(api.method)" size="mini">{{ api.method }}</el-tag>
              <div class="drawer-api-info">
                <strong>{{ api.path || '路径未配置' }}</strong
                ><span>{{ api.code || api.name }}</span>
              </div>
              <i class="el-icon-close drawer-remove" @click="openBinding(editingButton)" />
            </div>
          </div>
          <div v-else class="empty-api">暂未绑定操作接口</div>
          <el-button
            v-permission="'system.button.bind-api'"
            class="bind-api-button"
            icon="el-icon-plus"
            :disabled="!editingButton || !optionsReady"
            @click="openBinding(editingButton)"
            >绑定操作接口</el-button
          ></el-form
        >
      </div>
      <div class="drawer-footer">
        <el-button @click="buttonDrawerVisible = false">取消</el-button
        ><el-button
          v-permission="editingButton ? 'system.button.update' : 'system.button.create'"
          type="primary"
          :loading="saving"
          @click="submitButton"
          >保存</el-button
        >
      </div></el-drawer
    >

    <el-dialog
      title="绑定操作接口"
      :visible.sync="bindingVisible"
      width="680px"
      :close-on-click-modal="false"
      ><div class="binding-heading">
        <strong>{{ bindingButton ? bindingButton.label || bindingButton.name : '' }}</strong
        ><span class="muted">选择后将由该按钮触发对应接口</span>
      </div>
      <el-alert
        v-if="optionsReady && unavailableButtonApis.length"
        :title="'有 ' + unavailableButtonApis.length + ' 个历史绑定接口已停用，保存时将解除绑定。'"
        type="warning"
        :closable="false" /><el-select
        v-model="buttonApiIds"
        multiple
        filterable
        class="full-width"
        :disabled="!optionsReady"
        placeholder="搜索并选择操作接口"
        ><el-option v-for="api in apis" :key="api.id" :label="apiLabel(api)" :value="api.id"
      /></el-select>
      <div slot="footer">
        <el-button @click="bindingVisible = false">取消</el-button
        ><el-button
          v-permission="'system.button.bind-api'"
          type="primary"
          :disabled="!optionsReady"
          :loading="saving"
          @click="saveBindings('button')"
          >保存绑定</el-button
        >
      </div></el-dialog
    >

    <el-dialog
      title="编辑数据字段"
      :visible.sync="dataFieldDialogVisible"
      width="460px"
      :close-on-click-modal="false">
      <el-form
        ref="dataFieldForm"
        :model="dataFieldForm"
        :rules="dataFieldRules"
        label-width="100px">
        <el-form-item label="资源">
          <el-input :value="editingDataField ? editingDataField.resource : ''" disabled />
        </el-form-item>
        <el-form-item label="字段名">
          <el-input :value="editingDataField ? editingDataField.field : ''" disabled />
        </el-form-item>
        <el-form-item label="显示名称" prop="name">
          <el-input v-model.trim="dataFieldForm.name" maxlength="128" />
        </el-form-item>
        <el-form-item label="数据类型" prop="dataType">
          <el-select v-model="dataFieldForm.dataType" class="full-width">
            <el-option
              v-for="item in dataFieldTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="风险等级" prop="riskLevel">
          <el-select v-model="dataFieldForm.riskLevel" class="full-width">
            <el-option
              v-for="item in riskLevels"
              :key="item.value"
              :label="item.label"
              :value="item.value" />
          </el-select>
        </el-form-item>
        <el-alert
          title="字段名和读取/写入权限码不可编辑，避免影响已有角色授权。"
          type="info"
          :closable="false" />
      </el-form>
      <span slot="footer">
        <el-button @click="dataFieldDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submitDataField">保存</el-button>
      </span>
    </el-dialog>
  </div>
</template>

<script>
import {
  createPermissionButton,
  createPermissionFunction,
  getPermissionApiOptions,
  getPermissionDataFields,
  getPermissionFunctions,
  mapButtonApis,
  mapFunctionApis,
  updatePermissionFunction,
  updatePermissionButton,
  setPermissionFunctionStatus,
  setPermissionButtonStatus,
  setPermissionDataFieldStatus,
  updatePermissionDataField,
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
  searchableText,
} from './utils'
import PageTreePanel from './components/PageTreePanel.vue'

const emptyButton = () => ({ code: '', name: '', label: '', sort: 0, status: 'ACTIVE' })
const TAB_STORAGE_KEY = 'system-permission-active-tabs'
const TAB_NAMES = new Set(['apis', 'buttons', 'fields'])

function readStoredTab() {
  try {
    const value = JSON.parse(window.localStorage.getItem(TAB_STORAGE_KEY) || '"apis"')
    return typeof value === 'string' ? value : 'apis'
  } catch {
    return 'apis'
  }
}

function writeStoredTab(value) {
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 浏览器禁用本地存储时仍保留当前页面内的选项状态。
  }
}

export default {
  name: 'SystemPermission',
  components: { PageTreePanel },
  data() {
    return {
      loading: false,
      saving: false,
      loadError: '',
      functions: [],
      apis: [],
      dataFields: [],
      dataFieldsLoading: false,
      dataFieldDialogVisible: false,
      editingDataField: null,
      dataFieldForm: { name: '', dataType: 'string', riskLevel: 'L1' },
      dataFieldTypes: [
        { value: 'string', label: '字符串' },
        { value: 'number', label: '数字' },
        { value: 'boolean', label: '布尔值' },
        { value: 'enum', label: '枚举' },
        { value: 'datetime', label: '日期时间' },
        { value: 'array', label: '数组' },
        { value: 'object', label: '对象' },
        { value: 'secret', label: '敏感值' },
      ],
      riskLevels: [
        { value: 'L0', label: 'L0 · 低' },
        { value: 'L1', label: 'L1 · 一般' },
        { value: 'L2', label: 'L2 · 较高' },
        { value: 'L3', label: 'L3 · 高风险' },
      ],
      optionsReady: false,
      selectedId: null,
      activeTab: 'apis',
      pageKeyword: '',
      pageApiIds: [],
      buttonKeyword: '',
      buttonStatus: '',
      buttonBindingFilter: '',
      pageDialogVisible: false,
      editingPage: null,
      pageForm: { parentId: null, name: '', code: '', route: '', component: '', sort: 0 },
      buttonDrawerVisible: false,
      editingButton: null,
      buttonFunctionId: null,
      buttonForm: emptyButton(),
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
      dataFieldRules: {
        name: requiredText('显示名称'),
        dataType: [{ required: true, message: '请选择数据类型', trigger: 'change' }],
        riskLevel: [{ required: true, message: '请选择风险等级', trigger: 'change' }],
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
    allButtons() {
      return this.selectedFunction?.buttons || []
    },
    filteredButtons() {
      const keyword = searchableText(this.buttonKeyword)
      return this.allButtons.filter((button) => {
        const matchKeyword =
          !keyword ||
          searchableText(button.name, button.label, button.code, button.permission?.name).includes(
            keyword
          )
        const matchStatus = !this.buttonStatus || button.status === this.buttonStatus
        const hasApis = boundApis(button).length > 0
        const matchBinding =
          !this.buttonBindingFilter || (this.buttonBindingFilter === 'BOUND' ? hasApis : !hasApis)
        return matchKeyword && matchStatus && matchBinding
      })
    },
    buttonTotal() {
      return this.allButtons.length
    },
    buttonBoundCount() {
      return this.allButtons.filter((button) => boundApis(button).length).length
    },
    selectedResource() {
      const resource = this.selectedFunction?.code?.replace(/^page\./, '') || ''
      return resource === 'system.ops-tickets' ? 'system.ops-ticket' : resource
    },
  },
  created() {
    this.activeTab = readStoredTab()
    this.loadData()
  },
  methods: {
    boundApis,
    can(code) {
      const permissions = this.$store.getters.menu_list || []
      return permissions.includes(code) || permissions.includes('*')
    },
    methodTagType(method) {
      return (
        { GET: '', POST: 'success', PUT: 'warning', PATCH: 'warning', DELETE: 'danger' }[method] ||
        'info'
      )
    },
    riskTagType(level) {
      return { L0: 'info', L1: 'success', L2: 'warning', L3: 'danger' }[level] || 'info'
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
          this.restoreActiveTab()
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
        await this.loadDataFields()
        this.$nextTick(() => this.$refs.pageTreePanel?.setCurrentKey(this.selectedId))
      } finally {
        this.loading = false
      }
    },
    selectFunction(item) {
      if (this.saving) return
      this.selectedId = item.id
      this.restoreActiveTab()
      this.buttonKeyword = ''
      this.buttonStatus = ''
      this.buttonBindingFilter = ''
      this.syncPageApis()
      this.loadDataFields()
      this.buttonDrawerVisible = false
    },
    tabAvailable(name) {
      if (!TAB_NAMES.has(name)) return false
      if (name === 'buttons') return this.can('system.button.read')
      if (name === 'fields') return this.can('system.permission.field.read')
      return true
    },
    restoreActiveTab() {
      if (!this.tabAvailable(this.activeTab)) this.activeTab = 'apis'
    },
    rememberTab(tab) {
      const name = typeof tab === 'string' ? tab : tab?.name
      if (!this.tabAvailable(name)) return
      this.activeTab = name
      writeStoredTab(name)
    },
    async loadDataFields() {
      if (!this.can('system.permission.field.read') || !this.selectedResource) {
        this.dataFields = []
        return
      }
      this.dataFieldsLoading = true
      try {
        this.dataFields = await getPermissionDataFields(this.selectedResource)
      } catch {
        this.dataFields = []
      } finally {
        this.dataFieldsLoading = false
      }
    },
    async changeDataFieldStatus(field) {
      if (this.saving || !this.can('system.permission.field.disable')) return
      const nextStatus = field.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const action = nextStatus === 'ACTIVE' ? '启用' : '停用'
      if (
        !(await this.$confirm(
          `${action}字段“${field.name}”后，数据接口的字段返回和写入规则会立即生效，确认继续？`,
          '字段权限变更',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        await setPermissionDataFieldStatus(field.id, nextStatus)
        this.$message.success(`字段已${action}`)
        await this.loadDataFields()
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    openDataField(field) {
      if (!this.can('system.permission.field.update')) return
      this.editingDataField = field
      this.dataFieldForm = {
        name: field.name || '',
        dataType: field.dataType || 'string',
        riskLevel: field.riskLevel || 'L1',
      }
      this.dataFieldDialogVisible = true
      this.$nextTick(() => this.$refs.dataFieldForm?.clearValidate())
    },
    async submitDataField() {
      if (this.saving || !this.editingDataField || !this.can('system.permission.field.update'))
        return
      if (!(await this.$refs.dataFieldForm.validate().catch(() => false))) return
      this.saving = true
      try {
        await updatePermissionDataField(this.editingDataField.id, this.dataFieldForm)
        this.dataFieldDialogVisible = false
        this.$message.success('数据字段已保存')
        await this.loadDataFields()
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    syncPageApis() {
      this.pageApiIds = selectableIds(
        this.boundPageApis.map((api) => api.id),
        this.readApis
      )
    },
    apiLabel(api) {
      return `${api.name || api.code} (${api.method} ${api.path})`
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
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    openButton(button = null) {
      this.editingButton = button
      this.buttonFunctionId = this.selectedId
      this.buttonForm = button
        ? {
            code: button.code,
            name: button.name,
            label: button.label,
            sort: button.sort || 0,
            status: button.status || 'ACTIVE',
          }
        : emptyButton()
      this.buttonDrawerVisible = true
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
        this.buttonDrawerVisible = false
        this.$message.success('按钮已保存')
        await this.loadData()
      } catch {
        /* API layer reports the error. */
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
          `新增绑定 ${changes.added.length} 个，解除绑定 ${changes.removed.length} 个（包括不再可选的原绑定）。确认保存？`,
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
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    async changeStatus(kind, item) {
      if (this.saving || !this.can('system.' + kind + '.disable')) return
      const status = item.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const impact =
        kind === 'page'
          ? `涉及 ${descendantIds(this.functions, item.id).size - 1} 个子页面、${
              (item.buttons || []).length
            } 个按钮。`
          : `涉及 ${boundApis(item).length} 个操作接口绑定。`
      if (
        !(await this.$confirm(
          impact +
            (status === 'DISABLED'
              ? '停用后已有角色授权将暂时失效，确认停用？'
              : '启用后现有授权将恢复，确认启用？'),
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
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.permission-page {
  padding: 8px;
}
.permission-card {
  min-height: calc(100vh - 120px);
}
.permission-layout {
  display: flex;
  gap: 16px;
  min-height: 640px;
}
.detail-panel {
  flex: 1;
  min-width: 0;
}
.breadcrumb {
  color: #8a94a6;
  font-size: 13px;
  margin: 2px 0 10px;
}
.breadcrumb i {
  margin: 0 8px;
}
.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.title-wrap,
.header-actions,
.button-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
}
.title-wrap h2 {
  margin: 0;
  font-size: 20px;
  color: #202b3c;
}
.header-actions {
  gap: 8px;
}
.page-detail {
  margin-bottom: 12px;
}
.permission-tabs ::v-deep .el-tabs__item {
  font-size: 16px;
  font-weight: 600;
}
.permission-tabs-row {
  position: relative;
}
.permission-tabs {
  width: 100%;
}
.section-card,
.button-workspace {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 14px 16px;
}
.data-field-card {
  min-height: 420px;
}
.data-field-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.data-field-table {
  width: 100%;
}
.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #202b3c;
}
.muted {
  color: #909399;
  font-size: 13px;
}
.page-api-card .el-alert {
  margin: 14px 0;
}
.form-actions {
  margin-top: 16px;
}
.tabs-help {
  position: absolute;
  top: 2px;
  right: 0;
  z-index: 2;
}
.tip-trigger {
  width: 30px;
  height: 30px;
  padding: 0;
  color: #606266;
  font-size: 18px;
}
.tip-content {
  margin: 0;
  color: #606266;
  line-height: 1.6;
}
.button-toolbar {
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}
.button-search {
  width: 200px;
}
.button-filter {
  width: 140px;
}
.button-summary {
  margin-left: auto;
  color: #606a7a;
  font-size: 13px;
  white-space: nowrap;
}
.button-table ::v-deep .el-table__cell {
  padding: 8px 0;
}
.method-tag {
  margin: 2px 4px 2px 0;
}
.api-binding {
  display: inline-flex;
  align-items: center;
  max-width: 100%;
  margin-right: 6px;
}
.api-path {
  display: inline-block;
  max-width: 150px;
  overflow: hidden;
  color: #606266;
  text-overflow: ellipsis;
  vertical-align: middle;
  white-space: nowrap;
}
.more-apis {
  color: #409eff;
  font-size: 12px;
}
.table-footer {
  color: #8a94a6;
  font-size: 13px;
  padding-top: 10px;
}
.full-width {
  width: 100%;
}
.api-section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 24px 0 14px;
}
.section-line {
  flex: 1;
  height: 1px;
  background: #ebeef5;
}
.button-drawer-body {
  padding: 0 24px 90px;
}
.drawer-section-title {
  color: #202b3c;
  font-size: 16px;
  font-weight: 600;
  margin: 6px 0 18px;
}
.drawer-api-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.drawer-api-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px;
  border: 1px solid #ebeef5;
  border-radius: 6px;
}
.drawer-api-info {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drawer-api-info strong,
.drawer-api-info span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.drawer-api-info span {
  color: #909399;
  font-size: 12px;
}
.drawer-remove {
  color: #a0a8b5;
  cursor: pointer;
}
.empty-api {
  padding: 14px;
  border: 1px dashed #dcdfe6;
  color: #909399;
  text-align: center;
  border-radius: 6px;
  font-size: 13px;
}
.bind-api-button {
  width: 100%;
  margin-top: 12px;
}
.drawer-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 16px 24px;
  border-top: 1px solid #ebeef5;
  background: #fff;
  text-align: right;
}
.binding-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}
.binding-heading + .el-alert {
  margin-bottom: 14px;
}
.el-alert {
  margin-bottom: 16px;
}
@media (max-width: 1000px) {
  .permission-layout {
    flex-direction: column;
  }
  .button-summary {
    margin-left: 0;
  }
}
</style>
