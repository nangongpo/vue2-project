<template>
  <div class="permission-tabs-row">
    <el-tabs
      :value="activeTab"
      class="permission-tabs"
      @input="setActiveTab($event)"
      @tab-click="$emit('tab-click', $event)">
      <el-tab-pane label="页面基础接口" name="apis">
        <div class="section-card page-api-card">
          <el-alert
            class="page-api-notice"
            title="仅允许启用的 GET/read 接口。写操作、导出和审批接口应绑定具体按钮。"
            type="info"
            show-icon
            :closable="false" />
          <el-alert
            v-if="optionsReady && unavailablePageApis.length"
            :title="`有 ${unavailablePageApis.length} 个异常绑定，请点击对应接口的“解绑”按钮清理。`"
            type="warning"
            :closable="false" />
          <div class="page-api-binding-row">
            <el-select
              v-model="pageApiSelection"
              filterable
              class="page-api-select"
              :disabled="!can('system.page.api.bind') || !optionsReady"
              placeholder="选择页面基础接口">
              <el-option
                v-for="api in readApis"
                :key="api.id"
                :label="api.method + ' ' + api.path"
                :value="api.id" />
            </el-select>
            <el-button
              v-permission="'system.page.api.bind'"
              type="primary"
              :disabled="!optionsReady || !pageApiSelection"
              :loading="saving"
              @click="bindPageApi">
              绑定接口
            </el-button>
          </div>
          <div class="bound-api-heading">
            <span>已绑定接口</span>
            <span class="muted">{{ boundPageApis.length }} 个</span>
          </div>
          <el-table
            :data="boundPageApis"
            border
            stripe
            class="page-api-table"
            empty-text="当前页面暂无已绑定接口">
            <el-table-column label="请求方式" width="110">
              <template slot-scope="{ row }">
                <el-tag :type="methodTagType(row.method)" size="mini">{{ row.method }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="请求路径" min-width="220">
              <template slot-scope="{ row }">{{ row.path || '路径未配置' }}</template>
            </el-table-column>
            <el-table-column label="接口名称" min-width="180">
              <template slot-scope="{ row }">{{ row.name || row.code }}</template>
            </el-table-column>
            <el-table-column label="状态" width="90">
              <template slot-scope="{ row }">
                <el-tag :type="row.isActive ? 'success' : 'info'" size="mini">
                  {{ row.statusLabel }}
                </el-tag>
                <el-tag
                  v-if="isUnavailablePageApi(row)"
                  type="warning"
                  size="mini"
                  class="invalid-binding-tag">
                  异常绑定
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="90">
              <template slot-scope="{ row }">
                <el-button
                  v-permission="'system.page.api.bind'"
                  type="text"
                  class="text-danger"
                  :disabled="saving"
                  @click="unbindPageApi(row)">
                  解绑
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="can('system.button.read')" label="按钮与操作接口" name="buttons">
        <div class="button-workspace">
          <el-alert
            class="button-api-notice"
            title="按钮权限与操作接口需由角色独立授权，页面基础接口仅用于页面加载。"
            type="info"
            show-icon
            :closable="false" />
          <div class="button-toolbar">
            <el-button
              v-permission="'system.button.create'"
              type="primary"
              icon="el-icon-plus"
              @click="openButton()">
              新增按钮
            </el-button>
            <el-input
              :value="buttonKeyword"
              clearable
              prefix-icon="el-icon-search"
              class="button-search"
              placeholder="搜索权限名称 / 权限码"
              @input="buttonKeyword = $event" />
            <el-select
              :value="buttonStatus"
              clearable
              class="button-filter"
              placeholder="全部状态"
              @input="buttonStatus = $event">
              <el-option label="启用" value="ACTIVE" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
            <el-select
              :value="buttonBindingFilter"
              clearable
              class="button-filter"
              placeholder="全部绑定状态"
              @input="buttonBindingFilter = $event">
              <el-option label="已绑定接口" value="BOUND" />
              <el-option label="待配置" value="UNBOUND" />
            </el-select>
            <span class="button-summary"
              >{{ buttonTotal }} 个按钮 · {{ buttonBoundCount }} 个已绑定</span
            >
          </div>
          <el-table
            :data="filteredButtons"
            border
            stripe
            class="button-table"
            empty-text="暂无按钮">
            <el-table-column prop="label" label="显示文本" min-width="100" />
            <el-table-column prop="name" label="按钮名称" min-width="120" />
            <el-table-column prop="code" label="权限码" min-width="180" />
            <el-table-column label="绑定接口" min-width="210">
              <template slot-scope="{ row }">
                <template v-if="boundApis(row).length">
                  <span v-for="api in boundApis(row).slice(0, 2)" :key="api.id" class="api-binding">
                    <el-tag :type="methodTagType(api.method)" size="mini" class="method-tag">{{
                      api.method
                    }}</el-tag>
                    <span class="api-path">{{ api.path || '路径未配置' }}</span>
                  </span>
                  <span v-if="boundApis(row).length > 2" class="more-apis"
                    >+{{ boundApis(row).length - 2 }}</span
                  >
                </template>
                <span v-else class="muted">待配置</span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="82">
              <template slot-scope="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="mini">
                  {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="160" fixed="right">
              <template slot-scope="{ row }">
                <el-button
                  v-permission="'system.button.update'"
                  type="text"
                  @click="openButton(row)"
                  >编辑</el-button
                >
                <el-button
                  v-permission="'system.button.api.bind'"
                  type="text"
                  @click="openBinding(row)"
                  >绑定接口</el-button
                >
                <el-button
                  v-permission="'system.button.status'"
                  type="text"
                  :class="{ 'text-danger': row.status === 'ACTIVE' }"
                  :disabled="saving"
                  @click="changeStatus('button', row)">
                  {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="table-footer">共 {{ buttonTotal }} 条</div>
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="can('system.data-resource.read')" label="数据范围资源" name="resources">
        <div class="section-card data-resource-card">
          <div class="data-resource-heading">
            <el-alert
              class="data-resource-notice"
              title="仅登记可用于角色数据范围的业务对象，接口和字段资源不在此维护。"
              type="info"
              show-icon
              :closable="false" />
            <el-button icon="el-icon-refresh" :loading="dataResourcesLoading" @click="loadDataResources(true)">刷新</el-button>
          </div>
          <div class="data-resource-toolbar">
            <el-button
              v-permission="'system.data-resource.create'"
              type="primary"
              icon="el-icon-plus"
              @click="openDataResource()">
              登记资源
            </el-button>
            <el-input
              v-model="dataResourceKeyword"
              class="data-resource-search"
              clearable
              prefix-icon="el-icon-search"
              placeholder="检索资源名称或编码" />
            <span class="data-field-count">共 {{ filteredDataResources.length }} 个资源</span>
          </div>
          <el-table
            v-loading="dataResourcesLoading"
            :data="filteredDataResources"
            border
            stripe
            class="data-resource-table"
            empty-text="暂无数据范围资源">
            <el-table-column prop="name" label="资源名称" min-width="160" />
            <el-table-column prop="code" label="资源编码" min-width="180" />
            <el-table-column prop="description" label="说明" min-width="220" />
            <el-table-column label="状态" width="82">
              <template slot-scope="{ row }">
                <el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="mini">
                  {{ row.status === 'ACTIVE' ? '启用' : '停用' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template slot-scope="{ row }">
                <el-button v-permission="'system.data-resource.update'" type="text" @click="openDataResource(row)">编辑</el-button>
                <el-button
                  v-permission="'system.data-resource.status'"
                  type="text"
                  :class="{ 'text-danger': row.status === 'ACTIVE' }"
                  :disabled="saving"
                  @click="changeDataResourceStatus(row)">
                  {{ row.status === 'ACTIVE' ? '停用' : '启用' }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane v-if="can('system.field.read')" label="数据字段权限" name="fields">
        <div class="section-card data-field-card">
          <div class="data-field-heading">
            <div>
              <el-alert
                class="data-field-notice"
                title="控制当前数据资源的字段返回和写入权限，字段权限由角色独立授权。"
                type="info"
                show-icon
                :closable="false" />
            </div>
            <el-button icon="el-icon-refresh" :loading="dataFieldsLoading" @click="loadDataFields"
              >刷新</el-button
            >
          </div>
          <div class="data-field-toolbar">
            <el-button
              v-permission="'system.field.create'"
              type="primary"
              icon="el-icon-plus"
              @click="openDataField()"
              >新增字段</el-button
            >
            <el-input
              class="data-field-search"
              v-model="dataFieldKeyword"
              clearable
              prefix-icon="el-icon-search"
              placeholder="搜索字段名称 / 字段名 / 权限码" />
            <el-select v-model="dataFieldStatus" clearable placeholder="全部状态">
              <el-option label="启用" value="ACTIVE" />
              <el-option label="停用" value="DISABLED" />
            </el-select>
            <el-select v-model="dataFieldRisk" clearable placeholder="全部风险等级">
              <el-option label="L0 · 低" value="L0" />
              <el-option label="L1 · 一般" value="L1" />
              <el-option label="L2 · 较高" value="L2" />
              <el-option label="L3 · 高风险" value="L3" />
            </el-select>
            <span class="data-field-count">共 {{ filteredDataFields.length }} 个字段</span>
          </div>
          <el-table
            v-loading="dataFieldsLoading"
            :data="filteredDataFields"
            border
            stripe
            class="data-field-table"
            empty-text="当前页面暂无数据字段定义">
            <el-table-column prop="name" label="字段名称" min-width="120" />
            <el-table-column prop="field" label="字段名" min-width="100" />
            <el-table-column prop="dataType" label="类型" width="100" />
            <el-table-column label="读取权限" min-width="230">
              <template slot-scope="{ row }"
                ><el-tag size="mini" type="success">{{
                  row.readPermission && row.readPermission.code
                }}</el-tag></template
              >
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
              <template slot-scope="{ row }"
                ><el-tag :type="riskTagType(row.riskLevel)" size="mini">{{
                  row.riskLevel
                }}</el-tag></template
              >
            </el-table-column>
            <el-table-column label="状态" width="82">
              <template slot-scope="{ row }"
                ><el-tag :type="row.status === 'ACTIVE' ? 'success' : 'info'" size="mini">{{
                  row.status === 'ACTIVE' ? '启用' : '停用'
                }}</el-tag></template
              >
            </el-table-column>
            <el-table-column label="操作" width="100" fixed="right">
              <template slot-scope="{ row }">
                <el-button
                  v-permission="'system.field.update'"
                  type="text"
                  :disabled="saving"
                  @click="openDataField(row)"
                  >编辑</el-button
                >
                <el-button
                  v-permission="'system.field.status'"
                  type="text"
                  :class="{ 'text-danger': row.status === 'ACTIVE' }"
                  :disabled="saving"
                  @click="changeDataFieldStatus(row)"
                  >{{ row.status === 'ACTIVE' ? '停用' : '启用' }}</el-button
                >
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script>
export default {
  name: 'PermissionTabs',
  inject: {
    permissionContext: { default: null },
  },
  computed: {
    context() {
      return this.permissionContext
    },
    activeTab() {
      return this.context.activeTab
    },
    pageApiSelection: {
      get() {
        return this.context.pageApiSelection
      },
      set(value) {
        this.context.pageApiSelection = value
      },
    },
    readApis() {
      return this.context.readApis
    },
    optionsReady() {
      return this.context.pageOptionsReady
    },
    saving() {
      return this.context.saving
    },
    unavailablePageApis() {
      return this.context.unavailablePageApis
    },
    boundPageApis() {
      return this.context.boundPageApis
    },
    buttonKeyword: {
      get() {
        return this.context.buttonKeyword
      },
      set(value) {
        this.context.buttonKeyword = value
      },
    },
    buttonStatus: {
      get() {
        return this.context.buttonStatus
      },
      set(value) {
        this.context.buttonStatus = value
      },
    },
    buttonBindingFilter: {
      get() {
        return this.context.buttonBindingFilter
      },
      set(value) {
        this.context.buttonBindingFilter = value
      },
    },
    filteredButtons() {
      return this.context.filteredButtons
    },
    buttonTotal() {
      return this.context.buttonTotal
    },
    buttonBoundCount() {
      return this.context.buttonBoundCount
    },
    dataFields() {
      return this.context.dataFields
    },
    filteredDataFields() {
      return this.context.filteredDataFields
    },
    dataFieldsLoading() {
      return this.context.dataFieldsLoading
    },
    dataResourcesLoading() {
      return this.context.dataResourcesLoading
    },
    filteredDataResources() {
      return this.context.filteredDataResources
    },
    dataResourceKeyword: {
      get() {
        return this.context.dataResourceKeyword
      },
      set(value) {
        this.context.dataResourceKeyword = value
      },
    },
    dataFieldKeyword: {
      get() {
        return this.context.dataFieldKeyword
      },
      set(value) {
        this.context.dataFieldKeyword = value
      },
    },
    dataFieldStatus: {
      get() {
        return this.context.dataFieldStatus
      },
      set(value) {
        this.context.dataFieldStatus = value
      },
    },
    dataFieldRisk: {
      get() {
        return this.context.dataFieldRisk
      },
      set(value) {
        this.context.dataFieldRisk = value
      },
    },
    can() {
      return this.context.can
    },
    apiLabel() {
      return this.context.apiLabel
    },
    boundApis() {
      return this.context.boundApis
    },
    methodTagType() {
      return this.context.methodTagType
    },
    riskTagType() {
      return this.context.riskTagType
    },
    loadDataResources() {
      return this.context.loadDataResources
    },
    openDataResource() {
      return this.context.openDataResource
    },
    changeDataResourceStatus() {
      return this.context.changeDataResourceStatus
    },
  },
  methods: {
    isUnavailablePageApi(api) {
      return this.unavailablePageApis.some((item) => item.id === api.id)
    },
    setActiveTab(value) {
      this.context.activeTab = value
      this.$emit('input', value)
    },
    saveBindings(kind) {
      this.context.saveBindings(kind)
    },
    bindPageApi() {
      this.context.bindPageApi()
    },
    unbindPageApi(api) {
      this.context.unbindPageApi(api)
    },
    openButton(button) {
      this.context.openButton(button)
    },
    openBinding(button) {
      this.context.openBinding(button)
    },
    changeStatus(kind, item) {
      this.context.changeStatus(kind, item)
    },
    loadDataFields() {
      this.context.loadDataFields(true)
    },
    openDataField(field) {
      this.context.openDataField(field)
    },
    changeDataFieldStatus(field) {
      this.context.changeDataFieldStatus(field)
    },
  },
}
</script>

<style scoped>
.permission-tabs-row {
  position: relative;
}
.permission-tabs {
  width: 100%;
}
.permission-tabs ::v-deep .el-tabs__item {
  font-size: 16px;
  font-weight: 600;
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
.data-resource-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}
.data-resource-notice {
  flex: 1;
  margin: 0;
}
.data-resource-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.data-resource-search {
  width: 240px;
}
.data-field-notice {
  font-size: 14px;
  font-weight: 600;
}
.data-field-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.data-field-toolbar .el-input {
  width: 180px;
}
.data-field-toolbar .el-select {
  width: 140px;
}
.data-field-count {
  margin-left: auto;
  color: #8a94a6;
  font-size: 13px;
  white-space: nowrap;
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
.page-api-card .page-api-notice {
  margin: 0 0 14px;
  font-size: 14px;
  font-weight: 600;
}
.page-api-binding-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-api-select {
  width: 320px;
}
.bound-api-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 10px;
  color: #202b3c;
  font-size: 15px;
  font-weight: 600;
}
.page-api-table {
  width: 100%;
}
.button-api-notice {
  margin-bottom: 14px;
  font-size: 14px;
  font-weight: 600;
}
.button-toolbar {
  display: flex;
  align-items: center;
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
@media (max-width: 900px) {
  .page-api-binding-row {
    align-items: stretch;
    flex-direction: column;
  }
  .page-api-select {
    width: 100%;
  }
  .data-field-toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .data-field-toolbar .el-input,
  .data-field-toolbar .el-select {
    width: 100%;
  }
  .data-resource-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .data-resource-toolbar {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .data-resource-search {
    width: 100%;
  }
  .data-field-count {
    margin-left: 0;
  }
}
</style>
