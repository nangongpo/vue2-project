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
          @create="openDirectory"
          @refresh="loadData"
          @select="selectFunction"
          @create-page="openPage($event.id)"
          @edit-page="openPage(null, $event)"
          @delete-directory="deleteDirectory"
          @delete-page="deletePage"
          @toggle-status="changeStatus('page', $event)" />

        <section class="detail-panel">
          <template v-if="selectedFunction">
            <div class="breadcrumb">
              <span>权限管理</span><i class="el-icon-arrow-right" />{{ selectedFunction.name }}
            </div>
            <div class="detail-header">
              <div class="title-wrap">
                <h2>{{ selectedFunction.name }}</h2>
                <el-tag v-if="!isDirectory(selectedFunction)" :type="selectedFunction.status === 'ACTIVE' ? 'success' : 'info'">
                  {{ selectedFunction.status === 'ACTIVE' ? '启用' : '停用' }}
                </el-tag>
                <el-tag v-else type="warning">目录</el-tag>
              </div>
              <div class="header-actions">
                <el-button
                  v-if="isDirectory(selectedFunction)"
                  v-permission="'system.page.create'"
                  type="primary"
                  icon="el-icon-plus"
                  :disabled="selectedFunction.status !== 'ACTIVE'"
                  @click="openPage(selectedFunction.id)">
                  新增子页
                </el-button>
                <el-button
                  v-permission="isDirectory(selectedFunction) ? 'system.directory.update' : 'system.page.update'"
                  icon="el-icon-edit"
                  @click="openPage(null, selectedFunction)">
                  编辑
                </el-button>
              </div>
            </div>
            <el-descriptions class="page-detail" :column="3" border size="small">
              <el-descriptions-item label="权限码">{{
                selectedFunction.code
              }}</el-descriptions-item>
              <el-descriptions-item label="路由">{{ selectedFunction.route }}</el-descriptions-item>
              <el-descriptions-item label="节点类型">
                {{ isDirectory(selectedFunction) ? '目录' : '页面' }}
              </el-descriptions-item>
              <el-descriptions-item label="组件">
                {{ selectedFunction.component || '—' }}
              </el-descriptions-item>
              <el-descriptions-item label="父页面">{{ parentName }}</el-descriptions-item>
              <el-descriptions-item label="排序">{{ selectedFunction.sort }}</el-descriptions-item>
            </el-descriptions>

            <permission-tabs v-if="!isDirectory(selectedFunction)" v-model="activeTab" @tab-click="rememberTab" />
            <el-empty v-else class="directory-empty" description="目录节点仅用于组织页面，不配置接口、按钮和字段权限" />
          </template>
          <el-empty v-else description="请选择或新增页面" />
        </section>
      </div>
    </el-card>

    <permission-dialogs />
  </div>
</template>

<script>
import PageTreePanel from './components/PageTreePanel.vue'
import PermissionTabs from './components/PermissionTabs.vue'
import PermissionDialogs from './components/PermissionDialogs.vue'
import permissionController from './permission-controller'

export default {
  name: 'SystemPermission',
  components: { PageTreePanel, PermissionTabs, PermissionDialogs },
  mixins: [permissionController],
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
.header-actions {
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

@media (max-width: 1000px) {
  .permission-layout {
    flex-direction: column;
  }
}
</style>
