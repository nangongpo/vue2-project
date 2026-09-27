import {
  createPermissionButton,
  createPermissionFunction,
  createPermissionDirectory,
  deletePermissionDirectory,
  deletePermissionFunction,
  getPermissionApiOptions,
  getPermissionPageApiOptions,
  getPermissionDataFields,
  getDataResources,
  createDataResource,
  updateDataResource,
  setDataResourceStatus,
  createPermissionDataField,
  getPermissionFunctions,
  mapButtonApis,
  mapFunctionApis,
  updatePermissionFunction,
  updatePermissionDirectory,
  updatePermissionButton,
  enablePermissionFunction,
  disablePermissionFunction,
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
  methodTagType,
} from './utils'

const emptyButton = () => ({ code: '', name: '', label: '', sort: 0, status: 'ACTIVE' })
const TAB_STORAGE_KEY = 'system-permission-active-tabs'
const TAB_NAMES = new Set(['apis', 'buttons', 'fields', 'resources'])

function readStoredTab() {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(TAB_STORAGE_KEY) || '"apis"')
    return typeof value === 'string' ? value : 'apis'
  } catch {
    return 'apis'
  }
}

function writeStoredTab(value) {
  try {
    window.sessionStorage.setItem(TAB_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // 浏览器禁用本地存储时仍保留当前页面内的选项状态。
  }
}

export default {
  provide() {
    return { permissionContext: this }
  },
  data() {
    return {
      loading: false,
      saving: false,
      loadError: '',
      functions: [],
      apis: [],
      pageApisOptions: [],
      dataFields: [],
      dataFieldsLoading: false,
      dataFieldKeyword: '',
      dataFieldStatus: '',
      dataFieldRisk: '',
      dataFieldDialogVisible: false,
      editingDataField: null,
      dataFieldForm: { resource: '', field: '', name: '', dataType: 'string', riskLevel: 'L1', writable: false },
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
      pageOptionsReady: false,
      pageOptionsLoading: false,
      buttonOptionsReady: false,
      buttonOptionsLoading: false,
      dataFieldsResource: '',
      dataResources: [],
      dataResourcesLoading: false,
      dataResourceKeyword: '',
      dataResourceDialogVisible: false,
      editingDataResource: null,
      dataResourceForm: { code: '', name: '', description: '' },
      selectedId: null,
      activeTab: 'apis',
      pageKeyword: '',
      pageApiSelection: '',
      pageApiIds: [],
      buttonKeyword: '',
      buttonStatus: '',
      buttonBindingFilter: '',
      pageDialogVisible: false,
      editingPage: null,
      creatingDirectory: false,
      pageForm: {
        parentId: null,
        name: '',
        code: '',
        route: '',
        component: '',
        icon: '',
        routePropsText: '',
        nodeType: 'PAGE',
        sort: 0,
      },
      buttonDrawerVisible: false,
      editingButton: null,
      buttonFunctionId: null,
      buttonForm: emptyButton(),
      bindingVisible: false,
      bindingButton: null,
      buttonApiIds: [],
      pageRules: {
        name: requiredText('页面名称'),
        route: [
          ...requiredText('路由'),
          { pattern: /^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/, message: '请输入 /order 形式的前端路由', trigger: 'blur' },
        ],
        component: [{
          validator: (rule, value, callback) => {
            if (this.pageForm.nodeType === 'DIRECTORY') return callback()
            if (!value) return callback(new Error('请输入组件路径'))
            if (!/^[a-zA-Z][a-zA-Z0-9_-]*(?:\/[a-zA-Z][a-zA-Z0-9_-]*)*$/.test(value))
              return callback(new Error('请输入 system/health/index 形式的组件路径'))
            callback()
          },
          trigger: 'blur',
        }],
      },
      buttonRules: {
        code: requiredText('权限码'),
        name: requiredText('按钮名称'),
        label: requiredText('显示文本'),
      },
      dataFieldRules: {
        resource: requiredText('资源'),
        field: [
          ...requiredText('字段名'),
          { pattern: /^[a-z][a-zA-Z0-9_]{0,127}$/, message: '请输入有效字段名', trigger: 'blur' },
        ],
        name: requiredText('显示名称'),
        dataType: [{ required: true, message: '请选择数据类型', trigger: 'change' }],
        riskLevel: [{ required: true, message: '请选择风险等级', trigger: 'change' }],
      },
      dataResourceRules: {
        code: [
          ...requiredText('资源编码'),
          { pattern: /^[a-z][a-z0-9_.:-]{0,127}$/, message: '请输入有效业务资源编码', trigger: 'blur' },
        ],
        name: requiredText('资源名称'),
      },
    }
  },
  computed: {
    selectedFunction() {
      return this.functions.find((item) => item.id === this.selectedId) || null
    },
    isDirectory() {
      return (page) => !!page && page.nodeType === 'DIRECTORY'
    },
    pageTreeData() {
      return pageTree(this.functions, this.pageKeyword)
    },
    directoryParentOptions() {
      const excluded = descendantIds(this.functions, this.editingPage?.id)
      return this.functions.filter(
        (item) => item.nodeType === 'DIRECTORY' && item.status === 'ACTIVE' && !excluded.has(item.id)
      )
    },
    pagePermissionPreview() {
      if (this.editingPage) return this.editingPage.code || ''
      return this.buildNodeCode('PAGE')
    },
    nodeCodePreview() {
      return this.pageForm.nodeType === 'DIRECTORY'
        ? this.buildNodeCode('DIRECTORY')
        : this.pagePermissionPreview
    },
    pagePermissionPlaceholder() {
      return '根据上级页面和前端路由自动生成'
    },
    parentName() {
      return (
        this.functions.find((item) => item.id === this.selectedFunction?.parentId)?.name || '根页面'
      )
    },
    readApis() {
      return pageApis(this.pageApisOptions)
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
    filteredDataFields() {
      const keyword = searchableText(this.dataFieldKeyword)
      return this.dataFields.filter((field) => {
        const matchKeyword =
          !keyword ||
          searchableText(
            field.name,
            field.field,
            field.dataType,
            field.readPermission?.code,
            field.writePermission?.code
          ).includes(keyword)
        const matchStatus = !this.dataFieldStatus || field.status === this.dataFieldStatus
        const matchRisk = !this.dataFieldRisk || field.riskLevel === this.dataFieldRisk
        return matchKeyword && matchStatus && matchRisk
      })
    },
    filteredDataResources() {
      const keyword = searchableText(this.dataResourceKeyword)
      return this.dataResources.filter((resource) =>
        !keyword || searchableText(resource.name, resource.code, resource.description).includes(keyword)
      )
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
    methodTagType,
    buildNodeCode(nodeType) {
      const routeSegments = this.pageForm.route.split('/').filter(Boolean)
      if (!routeSegments.length) return ''
      const parent = this.functions.find((item) => item.id === this.pageForm.parentId)
      const parentCode = (parent?.code || '').replace(/^directory\./, '').split('.').filter(Boolean)
      const parentRoute = (parent?.route || '').split('/').filter(Boolean)
      const hasParentPrefix = parentRoute.every((segment, index) => routeSegments[index] === segment)
      const suffix = hasParentPrefix ? routeSegments.slice(parentRoute.length) : routeSegments
      const segments = [...parentCode, ...suffix]
      return [nodeType === 'PAGE' ? 'page' : null, ...segments].filter(Boolean).join('.')
    },
    routeWithParent(route, parentId = this.pageForm.parentId) {
      const normalized = '/' + String(route || '').replace(/^\/+|\/+$/g, '')
      const parent = this.functions.find((item) => item.id === parentId)
      if (!parent?.route) return normalized === '/' ? '' : normalized
      const parentRoute = '/' + parent.route.replace(/^\/+|\/+$/g, '')
      if (normalized === parentRoute || normalized.startsWith(parentRoute + '/')) return normalized
      return `${parentRoute}${normalized}`
    },
    can(code) {
      const permissions = this.$store.getters.menu_list || []
      return permissions.includes(code) || permissions.includes('*')
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
      try {
        this.functions = (await getPermissionFunctions()) || []
        if (!this.functions.some((item) => item.id === this.selectedId))
          this.selectedId = this.functions[0]?.id || null
        this.restoreActiveTab()
        await this.loadPageApiOptions()
        await this.ensureTabData(this.activeTab)
        this.syncPageApis()
        this.$nextTick(() => this.$refs.pageTreePanel?.setCurrentKey(this.selectedId))
      } catch (error) {
        this.functions = []
        this.selectedId = null
        this.loadError = error.message || '页面加载失败'
      } finally {
        this.loading = false
      }
    },
    async loadPageApiOptions() {
      if (this.pageOptionsReady || this.pageOptionsLoading) return
      if (!this.can('system.page.api.options')) return
      this.pageOptionsLoading = true
      try {
        this.pageApisOptions = activeApis(await getPermissionPageApiOptions())
        this.pageOptionsReady = true
      } catch {
        this.pageApisOptions = []
        this.loadError = this.loadError || '页面接口选项加载失败，请刷新重试。'
      } finally {
        this.pageOptionsLoading = false
      }
    },
    async loadButtonApiOptions() {
      if (this.buttonOptionsReady || this.buttonOptionsLoading) return
      if (!this.can('system.api.options')) return
      this.buttonOptionsLoading = true
      try {
        this.apis = activeApis(await getPermissionApiOptions())
        this.buttonOptionsReady = true
      } catch {
        this.apis = []
        this.loadError = this.loadError || '操作接口选项加载失败，请刷新重试。'
      } finally {
        this.buttonOptionsLoading = false
      }
    },
    async ensureTabData(tab = this.activeTab) {
      if (tab === 'buttons') return this.loadButtonApiOptions()
      if (tab === 'fields') return this.loadDataFields()
      if (tab === 'resources') return this.loadDataResources()
    },
    async selectFunction(item) {
      if (this.saving) return
      this.selectedId = item.id
      this.restoreActiveTab()
      this.buttonKeyword = ''
      this.buttonStatus = ''
      this.buttonBindingFilter = ''
      this.dataFieldKeyword = ''
      this.dataFieldStatus = ''
      this.dataFieldRisk = ''
      this.dataFields = []
      this.dataFieldsResource = ''
      this.syncPageApis()
      await this.ensureTabData(this.activeTab)
      this.buttonDrawerVisible = false
    },
    tabAvailable(name) {
      if (!TAB_NAMES.has(name)) return false
      if (name === 'buttons') return this.can('system.button.read')
      if (name === 'fields') return this.can('system.field.read')
      if (name === 'resources') return this.can('system.data-resource.read')
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
      this.ensureTabData(name)
    },
    async loadDataFields(force = false) {
      if (!this.can('system.field.read') || !this.selectedResource) {
        this.dataFields = []
        return
      }
      if (!force && this.dataFieldsResource === this.selectedResource && this.dataFields.length)
        return
      this.dataFieldsLoading = true
      try {
        this.dataFields = await getPermissionDataFields(this.selectedResource)
        this.dataFieldsResource = this.selectedResource
      } catch {
        this.dataFields = []
      } finally {
        this.dataFieldsLoading = false
      }
    },
    async loadDataResources(force = false) {
      if (!this.can('system.data-resource.read')) return
      if (!force && this.dataResources.length) return
      this.dataResourcesLoading = true
      try {
        this.dataResources = await getDataResources()
      } catch {
        this.dataResources = []
      } finally {
        this.dataResourcesLoading = false
      }
    },
    openDataResource(resource = null) {
      if (!(resource ? this.can('system.data-resource.update') : this.can('system.data-resource.create'))) return
      this.editingDataResource = resource
      this.dataResourceForm = {
        code: resource?.code || '',
        name: resource?.name || '',
        description: resource?.description || '',
      }
      this.dataResourceDialogVisible = true
    },
    async submitDataResource(form) {
      const creating = !this.editingDataResource
      if (this.saving || !this.can(creating ? 'system.data-resource.create' : 'system.data-resource.update')) return
      if (!(await form?.validate().catch(() => false))) return
      this.saving = true
      try {
        if (creating) await createDataResource(this.dataResourceForm)
        else await updateDataResource(this.editingDataResource.id, { name: this.dataResourceForm.name, description: this.dataResourceForm.description })
        this.dataResourceDialogVisible = false
        this.$message.success(creating ? '数据资源已登记' : '数据资源已保存')
        await this.loadDataResources(true)
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    async changeDataResourceStatus(resource) {
      if (this.saving || !this.can('system.data-resource.status')) return
      const nextStatus = resource.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const action = nextStatus === 'ACTIVE' ? '启用' : '停用'
      if (!(await this.$confirm(`${action}数据资源“${resource.name}”后，角色数据范围将${action === '启用' ? '可以' : '不能'}新增授权，确认继续？`, '数据资源状态变更', { type: 'warning' }).then(() => true).catch(() => false))) return
      this.saving = true
      try {
        await setDataResourceStatus(resource.id, nextStatus)
        this.$message.success(`数据资源已${action}`)
        await this.loadDataResources(true)
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    async changeDataFieldStatus(field) {
      if (this.saving || !this.can('system.field.status')) return
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
        await this.loadDataFields(true)
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    openDataField(field = null) {
      if (!(field ? this.can('system.field.update') : this.can('system.field.create'))) return
      this.editingDataField = field
      this.dataFieldForm = {
        resource: field?.resource || this.selectedResource,
        field: field?.field || '',
        name: field?.name || '',
        dataType: field?.dataType || 'string',
        riskLevel: field?.riskLevel || 'L1',
        writable: Boolean(field?.writePermission),
      }
      this.dataFieldDialogVisible = true
    },
    async submitDataField() {
      const creating = !this.editingDataField
      if (this.saving || !this.can(creating ? 'system.field.create' : 'system.field.update'))
        return
      this.saving = true
      try {
        if (creating) await createPermissionDataField(this.dataFieldForm)
        else await updatePermissionDataField(this.editingDataField.id, this.dataFieldForm)
        this.dataFieldDialogVisible = false
        this.$message.success(creating ? '数据字段已新增' : '数据字段已保存')
        await this.loadDataFields(true)
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
      this.pageApiSelection = ''
    },
    apiLabel(api) {
      return `${api.name || api.code} (${api.method} ${api.path})`
    },
    openPage(parentId, page = null) {
      this.editingPage = page
      this.creatingDirectory = false
      this.pageForm = page
        ? {
            name: page.name,
            code: page.code,
            route: page.route,
            component: page.component || '',
            icon: page.icon || '',
            routePropsText: page.routeProps ? JSON.stringify(page.routeProps, null, 2) : '',
            nodeType: page.nodeType || (page.component ? 'PAGE' : 'DIRECTORY'),
            parentId: page.parentId || null,
            sort: page.sort || 0,
          }
        : {
            parentId,
            name: '',
            code: '',
            route: '',
            component: '',
            icon: '',
            routePropsText: '',
            nodeType: 'PAGE',
            sort: 0,
          }
      this.pageDialogVisible = true
    },
    openDirectory(parentId = null) {
      this.editingPage = null
      this.creatingDirectory = true
      this.pageForm = {
        parentId,
        name: '',
        code: '',
        route: '',
        component: '',
        icon: '',
        routePropsText: '',
        nodeType: 'DIRECTORY',
        sort: 0,
      }
      this.pageDialogVisible = true
    },
    async submitPage() {
      const permission = this.editingPage
        ? this.editingPage.nodeType === 'DIRECTORY'
          ? 'system.directory.update'
          : 'system.page.update'
        : this.creatingDirectory
        ? 'system.directory.create'
        : 'system.page.create'
      if (this.saving) return
      if (!this.can(permission)) {
        this.$message.error('当前账号没有页面编辑权限')
        return
      }
      this.saving = true
      try {
        const { name, route, component, icon, routePropsText, sort } = this.pageForm
        const fullRoute = this.routeWithParent(route)
        let routeProps = null
        if (this.pageForm.nodeType === 'PAGE' && routePropsText.trim()) {
          try {
            routeProps = JSON.parse(routePropsText)
          } catch {
            this.$message.error('路由参数必须是合法的 JSON 对象')
            return
          }
          if (!routeProps || Array.isArray(routeProps) || typeof routeProps !== 'object') {
            this.$message.error('路由参数必须是 JSON 对象')
            return
          }
        }
        const data = {
          name,
          route: fullRoute,
          component: this.pageForm.nodeType === 'PAGE' ? component : undefined,
          icon: icon || undefined,
          ...(this.pageForm.nodeType === 'PAGE' && routePropsText.trim() ? { routeProps } : {}),
          sort,
          parentId: this.pageForm.parentId || null,
        }
        if (this.editingPage) {
          let result
          if (this.editingPage.nodeType === 'DIRECTORY') result = await updatePermissionDirectory(this.editingPage.id, data)
          else result = await updatePermissionFunction(this.editingPage.id, data)
          this.pageDialogVisible = false
          this.$message.success(
            result?.status === 'REQUESTED'
              ? '前端路由及组件路径变更已提交审批，审批执行后生效'
              : '页面已保存'
          )
        }
        else {
          const created = this.creatingDirectory
            ? await createPermissionDirectory({
                name,
                route: fullRoute,
                icon: icon || undefined,
                sort,
                parentId: this.pageForm.parentId || null,
              })
            : await createPermissionFunction({
                ...data,
                code: this.pagePermissionPreview,
                apiIds: [],
              })
          this.selectedId = created.id
        }
        if (!this.editingPage) {
          this.pageDialogVisible = false
          this.$message.success('页面已保存')
        }
        await this.loadData()
      } catch (error) {
        this.$message.error(error.message || '页面保存失败，请检查后重试')
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
    },
    async submitButton() {
      if (
        this.saving ||
        !this.can(this.editingButton ? 'system.button.update' : 'system.button.create')
      )
        return
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
    async bindPageApi() {
      if (!this.pageApiSelection) return
      this.pageApiIds = selectableIds([...this.pageApiIds, this.pageApiSelection], this.readApis)
      await this.saveBindings('page')
    },
    async unbindPageApi(api) {
      this.pageApiIds = this.pageApiIds.filter((id) => id !== api.id)
      await this.saveBindings('page')
    },
    async saveBindings(kind) {
      const target = kind === 'page' ? this.selectedFunction : this.bindingButton
      const optionsReady = kind === 'page' ? this.pageOptionsReady : this.buttonOptionsReady
      if (!target || this.saving || !optionsReady || !this.can('system.' + kind + '.api.bind'))
        return
      const ids = selectableIds(
        kind === 'page' ? this.pageApiIds : this.buttonApiIds,
        kind === 'page' ? this.readApis : this.apis
      )
      const changes = grantChanges(
        boundApis(target).map((api) => api.id),
        ids
      )
      const unavailableCount =
        kind === 'page' ? this.unavailablePageApis.length : this.unavailableButtonApis.length
      const impactMessage =
        kind === 'page' && unavailableCount
          ? `将新增 ${changes.added.length} 个接口，并解除 ${unavailableCount} 个异常绑定。异常绑定无法继续作为页面基础接口。确认保存？`
          : `新增绑定 ${changes.added.length} 个，解除绑定 ${changes.removed.length} 个。确认保存？`
      if (
        !(await this.$confirm(
          impactMessage,
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
      const status = item.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE'
      const permission =
        kind === 'page'
          ? status === 'ACTIVE'
            ? 'system.page.enable'
            : 'system.page.disable'
          : 'system.button.status'
      if (this.saving || !this.can(permission)) return
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
              : '启用后不会自动恢复历史角色授权，需重新配置角色权限。确认启用？'),
          item.name,
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        let result
        if (kind === 'page') {
          result = await (status === 'ACTIVE' ? enablePermissionFunction : disablePermissionFunction)(item.id)
        } else {
          result = await setPermissionButtonStatus(item.id, status)
        }
        this.$message.success(
          result?.status === 'REQUESTED' ? '已提交受控审批，审批执行后生效' : '状态已更新'
        )
        if (kind === 'page' && status === 'ACTIVE' && result?.status !== 'REQUESTED') {
          await this.$confirm(
            '页面已启用，但历史角色授权不会自动恢复。请前往角色管理重新配置页面权限。',
            '需要重新授权',
            { confirmButtonText: '前往角色管理', cancelButtonText: '稍后处理', type: 'info' }
          )
            .then(() => this.$router.push('/system/role'))
            .catch(() => {})
        }
        await this.loadData()
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    async deleteDirectory(item) {
      if (
        !item ||
        item.nodeType !== 'DIRECTORY' ||
        this.saving ||
        !this.can('system.directory.delete')
      )
        return
      const hasChildren = this.functions.some((page) => page.parentId === item.id)
      if (hasChildren) {
        this.$message.warning('目录包含子节点，不能删除')
        return
      }
      if (
        !(await this.$confirm(
          `确认删除目录“${item.name}”？删除后不可恢复。`,
          '删除目录',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        await deletePermissionDirectory(item.id)
        this.selectedId = null
        this.$message.success('目录已删除')
        await this.loadData()
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
    async deletePage(item) {
      if (!item || item.nodeType === 'DIRECTORY' || this.saving || !this.can('system.page.delete'))
        return
      const hasChildren = this.functions.some((page) => page.parentId === item.id)
      if (hasChildren) {
        this.$message.warning('页面包含子节点，不能删除')
        return
      }
      if (
        !(await this.$confirm(
          `确认删除页面“${item.name}”？删除后不可恢复。`,
          '删除页面',
          { type: 'warning' }
        )
          .then(() => true)
          .catch(() => false))
      )
        return
      this.saving = true
      try {
        await deletePermissionFunction(item.id)
        this.selectedId = null
        this.$message.success('页面已删除')
        await this.loadData()
      } catch {
        /* API layer reports the error. */
      } finally {
        this.saving = false
      }
    },
  },
}
