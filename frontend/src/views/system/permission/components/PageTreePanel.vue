<template>
  <aside class="page-panel">
    <div class="page-panel-head">
      <el-button
        v-permission="'system.page.create'"
        type="primary"
        class="create-page"
        @click="$emit('create')"
        >新增页面</el-button
      >
      <el-button
        v-permission="'system.page.read'"
        class="refresh-button"
        icon="el-icon-refresh"
        title="刷新"
        :disabled="loading"
        @click="$emit('refresh')" />
    </div>
    <el-input
      :value="keyword"
      clearable
      prefix-icon="el-icon-search"
      placeholder="搜索名称 / 权限码 / 路由"
      @input="$emit('update:keyword', $event)" />
    <el-tree
      ref="pageTree"
      class="page-tree"
      :key="`page-tree-${keyword || 'all'}`"
      node-key="id"
      highlight-current
      default-expand-all
      :data="treeData"
      :props="{ label: 'name' }"
      :expand-on-click-node="false"
      @node-click="$emit('select', $event)">
      <span slot-scope="{ data }" class="tree-node"
        ><i class="el-icon-document tree-node-icon" /><span class="tree-node-name">{{
          data.name
        }}</span
        ><el-tag :type="data.status === 'ACTIVE' ? 'success' : 'info'" size="mini">{{
          data.status === 'ACTIVE' ? '启用' : '停用'
        }}</el-tag></span
      >
    </el-tree>
  </aside>
</template>

<script>
export default {
  name: 'PermissionPageTreePanel',
  props: {
    treeData: { type: Array, default: () => [] },
    keyword: { type: String, default: '' },
    loading: { type: Boolean, default: false },
    selectedId: { type: [String, Number], default: null },
  },
  methods: {
    setCurrentKey(id) {
      this.$refs.pageTree?.setCurrentKey(id)
    },
  },
}
</script>

<style scoped>
.page-panel {
  width: 220px;
  flex: 0 0 220px;
  border-right: 1px solid #ebeef5;
  padding-right: 16px;
}
.page-panel-head {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 16px;
}
.create-page {
  width: 140px;
}
.refresh-button {
  width: 38px;
  padding: 0;
}
.page-tree {
  margin-top: 16px;
}
.tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  min-width: 0;
}
.tree-node-icon {
  color: #8a94a6;
}
.tree-node-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
@media (max-width: 1000px) {
  .page-panel {
    width: auto;
    flex-basis: auto;
    border-right: 0;
    padding-right: 0;
  }
}
</style>
