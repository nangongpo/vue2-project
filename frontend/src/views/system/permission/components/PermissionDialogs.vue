<template>
  <div>
    <el-dialog
      :title="editingDataResource ? '编辑数据范围资源' : '登记数据范围资源'"
      :visible.sync="dataResourceDialogVisible"
      width="460px"
      :close-on-click-modal="false">
      <el-form ref="dataResourceForm" :model="dataResourceForm" :rules="dataResourceRules" label-width="100px">
        <el-form-item label="资源编码" prop="code">
          <el-input v-model.trim="dataResourceForm.code" :disabled="!!editingDataResource" maxlength="128" placeholder="例如 order" />
        </el-form-item>
        <el-form-item label="资源名称" prop="name">
          <el-input v-model.trim="dataResourceForm.name" maxlength="128" placeholder="例如 订单" />
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model.trim="dataResourceForm.description" maxlength="255" placeholder="可选" />
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="dataResourceDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="submitDataResource">
          保存
        </el-button>
      </span>
    </el-dialog>

    <el-dialog
      :title="editingPage ? (pageForm.nodeType === 'DIRECTORY' ? '编辑目录' : '编辑页面') : (creatingDirectory ? '新增目录' : '新增页面')"
      :visible.sync="pageVisible"
      width="580px"
      :close-on-click-modal="false">
      <el-form ref="pageForm" :model="pageForm" :rules="pageRules" label-width="100px">
        <el-form-item label="上级目录">
          <el-select
            v-model="pageForm.parentId"
            clearable
            filterable
            class="full-width"
            placeholder="不选择表示根节点">
            <el-option
              v-for="item in directoryParentOptions"
              :key="item.id"
              :label="item.name + ' (' + item.route + ')'"
              :value="item.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="pageForm.nodeType === 'DIRECTORY' ? '目录名称' : '页面名称'" prop="name"
          ><el-input v-model.trim="pageForm.name" maxlength="128"
        /></el-form-item>
        <el-form-item label="前端路由" prop="route"
          ><el-input v-model.trim="pageForm.route" maxlength="255" placeholder="/order"
        /></el-form-item>
        <el-form-item label="权限码">
          <el-input :value="nodeCodePreview" disabled :placeholder="pagePermissionPlaceholder" />
        </el-form-item>
        <el-form-item label="菜单图标">
          <el-input v-model.trim="pageForm.icon" maxlength="128" placeholder="例如 platform-manage" />
        </el-form-item>
        <el-form-item v-if="pageForm.nodeType === 'PAGE'" label="组件路径"
          ><el-input v-model.trim="pageForm.component" maxlength="255" placeholder="例如 system/health/index"
        /></el-form-item>
        <el-form-item v-if="pageForm.nodeType === 'PAGE'" label="路由参数" prop="routePropsText">
          <el-input
            v-model="pageForm.routePropsText"
            type="textarea"
            :rows="4"
            placeholder='请输入 JSON 对象，例如：{"mode":"readonly"}'
            @blur="formatRouteProps"
          />
          <div class="form-help">失焦后会自动格式化；必须是合法的 JSON 对象，例如 {"mode":"readonly"}。</div>
        </el-form-item>
        <el-form-item label="排序"
          ><el-input-number v-model="pageForm.sort" :min="0" :max="9999" :precision="0"
        /></el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="pageVisible = false">取消</el-button>
        <el-button
          v-permission="editingPage ? (pageForm.nodeType === 'DIRECTORY' ? 'system.directory.update' : 'system.page.update') : (creatingDirectory ? 'system.directory.create' : 'system.page.create')"
          type="primary"
          :loading="saving"
          @click="validateAndSubmit('pageForm', 'submit-page')"
          >保存</el-button
        >
      </span>
    </el-dialog>

    <el-dialog
      :title="editingButton ? '编辑按钮' : '新增按钮'"
      :visible.sync="buttonVisible"
      width="460px"
      :close-on-click-modal="false">
      <el-form ref="buttonForm" :model="buttonForm" :rules="buttonRules" label-width="100px">
        <el-form-item label="操作标识" prop="actionKey">
          <el-select
            v-if="!editingButton"
            v-model="buttonForm.actionKey"
            filterable
            class="full-width"
            :loading="operationActionOptionsLoading"
            :disabled="!operationActionOptionsReady"
            placeholder="请选择操作标识">
            <el-option
              v-for="item in operationActionOptions"
              :key="item.value"
              :label="item.value + ' · ' + item.label"
              :value="item.value">
              <span>{{ item.value }} · {{ item.label }}</span>
              <small class="operation-action-description">{{ item.description }}</small>
            </el-option>
          </el-select>
          <el-input v-else :value="buttonForm.actionKey" disabled />
        </el-form-item>
        <el-form-item label="显示文本" prop="label">
          <el-input v-model.trim="buttonForm.label" maxlength="128" placeholder="例如 新增用户" />
        </el-form-item>
        <el-form-item label="权限码">
          <el-input :value="buttonCodePreview" disabled placeholder="根据页面权限码和操作标识自动生成" />
        </el-form-item>
        <el-form-item v-if="editingButton" label="状态">
          <el-select v-model="buttonForm.status" class="full-width" disabled>
            <el-option label="启用" value="ACTIVE" />
            <el-option label="停用" value="DISABLED" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="editingButton" label="排序">
          <el-input-number v-model="buttonForm.sort" :min="0" :max="9999" :precision="0" />
        </el-form-item>
        <el-form-item v-if="editingButton" label="操作接口">
          <div v-if="boundApis(editingButton).length" class="readonly-api-list">
            <el-tag
              v-for="api in boundApis(editingButton)"
              :key="api.id"
              size="small"
              class="readonly-api-tag">
              {{ api.method }} {{ api.path || api.code }}
            </el-tag>
          </div>
          <span v-else class="muted">未绑定操作接口</span>
        </el-form-item>
      </el-form>
      <span slot="footer">
        <el-button @click="buttonVisible = false">取消</el-button>
        <el-button
          v-permission="editingButton ? 'system.button.update' : 'system.button.create'"
          type="primary"
          :loading="saving"
          @click="validateAndSubmit('buttonForm', 'submit-button')">
          保存
        </el-button>
      </span>
    </el-dialog>

    <el-dialog
      title="绑定操作接口"
      :visible.sync="bindingVisibleProxy"
      width="460px"
      :close-on-click-modal="false">
      <el-form label-width="100px" class="binding-button-info">
        <el-form-item label="显示文本">
          <el-input :value="bindingButton ? bindingButton.label : ''" disabled />
        </el-form-item>
        <el-form-item label="操作标识">
          <el-input :value="bindingButton ? bindingButton.name : ''" disabled />
        </el-form-item>
        <el-form-item label="权限码">
          <el-input :value="bindingButton ? bindingButton.code : ''" disabled />
        </el-form-item>
        <el-form-item label="状态">
          <el-input :value="bindingButton ? bindingButton.statusLabel : ''" disabled />
        </el-form-item>
      </el-form>
      <el-form label-width="100px">
        <el-form-item label="绑定接口">
          <el-select
            v-model="buttonApiIdsProxy"
            multiple
            filterable
            class="full-width"
            popper-class="permission-binding-api-options"
            :disabled="!optionsReady"
            placeholder="搜索并选择操作接口">
            <el-option v-for="api in apis" :key="api.id" :label="apiLabel(api)" :value="api.id">
              <span class="permission-binding-api-option">{{ apiLabel(api) }}</span>
            </el-option>
          </el-select>
        </el-form-item>
      </el-form>
      <div slot="footer">
        <el-button @click="bindingVisibleProxy = false">取消</el-button>
        <el-button
          v-permission="'system.button.api.bind'"
          type="primary"
          :disabled="!optionsReady"
          :loading="saving"
          @click="saveBindings('button')"
          >保存绑定</el-button
        >
      </div>
    </el-dialog>

    <el-dialog
      :title="editingDataField ? '编辑数据字段' : '新增数据字段'"
      :visible.sync="dataFieldVisible"
      width="460px"
      :close-on-click-modal="false">
      <el-form
        ref="dataFieldForm"
        :model="dataFieldForm"
        :rules="dataFieldRules"
        label-width="100px">
        <el-form-item label="资源"
          ><el-input :value="dataFieldForm.resource" disabled
        /></el-form-item>
        <el-form-item label="字段名" prop="field"
          ><el-input v-model.trim="dataFieldForm.field" :disabled="!!editingDataField"
        /></el-form-item>
        <el-form-item label="显示名称" prop="name"
          ><el-input v-model.trim="dataFieldForm.name" maxlength="128"
        /></el-form-item>
        <el-form-item label="数据类型" prop="dataType"
          ><el-select v-model="dataFieldForm.dataType" class="full-width"
            ><el-option
              v-for="item in dataFieldTypes"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select
        ></el-form-item>
        <el-form-item label="风险等级" prop="riskLevel"
          ><el-select v-model="dataFieldForm.riskLevel" class="full-width"
            ><el-option
              v-for="item in riskLevels"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select
        ></el-form-item>
        <el-form-item v-if="!editingDataField" label="允许写入">
          <el-switch v-model="dataFieldForm.writable" />
        </el-form-item>
        <el-alert
          title="字段名和读取/写入权限码不可编辑，避免影响已有角色授权。"
          type="info"
          :closable="false" />
      </el-form>
      <span slot="footer">
        <el-button @click="dataFieldVisible = false">取消</el-button>
        <el-button
          type="primary"
          :loading="saving"
          @click="validateAndSubmit('dataFieldForm', 'submit-data-field')"
          >保存</el-button
        >
      </span>
    </el-dialog>
  </div>
</template>

<script>
export default {
  name: 'PermissionDialogs',
  inject: {
    permissionContext: { default: null },
  },
  computed: {
    context() {
      return this.permissionContext
    },
    dataResourceDialogVisible: {
      get() {
        return this.context.dataResourceDialogVisible
      },
      set(value) {
        this.context.dataResourceDialogVisible = value
      },
    },
    editingDataResource() {
      return this.context.editingDataResource
    },
    dataResourceForm() {
      return this.context.dataResourceForm
    },
    dataResourceRules() {
      return this.context.dataResourceRules
    },
    pageDialogVisible() {
      return this.context.pageDialogVisible
    },
    editingPage() {
      return this.context.editingPage
    },
    pageForm() {
      return this.context.pageForm
    },
    pageRules() {
      return this.context.pageRules
    },
    pagePermissionPlaceholder() {
      return this.context.pagePermissionPlaceholder
    },
    pagePermissionPreview() {
      return this.context.pagePermissionPreview
    },
    nodeCodePreview() {
      return this.context.nodeCodePreview
    },
    buttonCodePreview() {
      return this.context.buttonCodePreview
    },
    directoryParentOptions() {
      return this.context.directoryParentOptions
    },
    creatingDirectory() {
      return this.context.creatingDirectory
    },
    buttonDrawerVisible() {
      return this.context.buttonDrawerVisible
    },
    editingButton() {
      return this.context.editingButton
    },
    buttonForm() {
      return this.context.buttonForm
    },
    buttonRules() {
      return this.context.buttonRules
    },
    bindingVisible() {
      return this.context.bindingVisible
    },
    bindingButton() {
      return this.context.bindingButton
    },
    buttonApiIds() {
      return this.context.buttonApiIds
    },
    apis() {
      return this.context.apis
    },
    unavailableButtonApis() {
      return this.context.unavailableButtonApis
    },
    dataFieldDialogVisible() {
      return this.context.dataFieldDialogVisible
    },
    editingDataField() {
      return this.context.editingDataField
    },
    dataFieldForm() {
      return this.context.dataFieldForm
    },
    dataFieldRules() {
      return this.context.dataFieldRules
    },
    dataFieldTypes() {
      return this.context.dataFieldTypes
    },
    riskLevels() {
      return this.context.riskLevels
    },
    optionsReady() {
      return this.context.buttonOptionsReady
    },
    saving() {
      return this.context.saving
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
    pageVisible: {
      get() {
        return this.pageDialogVisible
      },
      set(value) {
        this.context.pageDialogVisible = value
      },
    },
    buttonVisible: {
      get() {
        return this.buttonDrawerVisible
      },
      set(value) {
        this.context.buttonDrawerVisible = value
      },
    },
    bindingVisibleProxy: {
      get() {
        return this.bindingVisible
      },
      set(value) {
        this.context.bindingVisible = value
      },
    },
    dataFieldVisible: {
      get() {
        return this.dataFieldDialogVisible
      },
      set(value) {
        this.context.dataFieldDialogVisible = value
      },
    },
    buttonApiIdsProxy: {
      get() {
        return this.buttonApiIds
      },
      set(value) {
        this.context.buttonApiIds = value
      },
    },
    operationActionOptions() {
      return this.context.operationActionOptions
    },
    operationActionOptionsReady() {
      return this.context.operationActionOptionsReady
    },
    operationActionOptionsLoading() {
      return this.context.operationActionOptionsLoading
    },
  },
  methods: {
    formatRouteProps() {
      this.context.formatRouteProps()
    },
    submitDataResource() {
      this.context.submitDataResource(this.$refs.dataResourceForm)
    },
    openBinding(button) {
      this.context.openBinding(button)
    },
    saveBindings(kind) {
      this.context.saveBindings(kind)
    },
    validateAndSubmit(formRef, eventName) {
      this.$refs[formRef].validate((valid) => {
        const submitter = {
          'submit-page': 'submitPage',
          'submit-button': 'submitButton',
          'submit-data-field': 'submitDataField',
        }[eventName]
        if (valid && submitter) this.context[submitter]()
      })
    },
  },
}
</script>

<style scoped>
.full-width {
  width: 100%;
}
.button-drawer-body {
  padding: 0 24px 90px;
}

.readonly-api-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 4px;
}

.readonly-api-tag {
  max-width: 100%;
}

.operation-action-description {
  float: right;
  color: #909399;
  margin-left: 12px;
}
.drawer-section-title {
  color: #202b3c;
  font-size: 16px;
  font-weight: 600;
  margin: 6px 0 18px;
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
.drawer-api-info span,
.muted {
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
::v-deep .permission-binding-api-options .el-select-dropdown__item {
  height: auto;
  line-height: 20px;
  white-space: normal;
}
.permission-binding-api-option {
  display: block;
  white-space: normal;
  word-break: break-word;
}
.el-alert {
  margin-bottom: 16px;
}
</style>
