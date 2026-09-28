<template>
  <aside class="page-panel">
    <div class="page-panel-head">
      <el-button
        v-permission="'system.directory.create'"
        type="primary"
        class="create-page"
        @click="$emit('create')"
        >新增目录</el-button
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
      :indent="14"
      :expand-on-click-node="false"
      @node-click="selectNode">
      <span slot-scope="{ data }" class="tree-node">
        <i
          :class="data.nodeType === 'DIRECTORY' ? 'el-icon-folder-opened' : 'el-icon-document'"
          class="tree-node-icon"
        />
        <span class="tree-node-name">{{ data.name }}</span>
        <span
          v-if="data.nodeType === 'DIRECTORY'"
          class="tree-node-meta tree-directory-meta"
          @click.stop
        >
          <el-button
          v-if="data.isActive"
            v-permission="'system.page.create'"
            type="text"
            class="tree-directory-link"
            @click="$emit('create-page', data)"
          >
            新增子页
          </el-button>
          <el-button
            v-permission="'system.directory.delete'"
            type="text"
            class="tree-inline-action tree-inline-action-danger"
            icon="el-icon-delete"
            title="删除目录"
            @click="$emit('delete-directory', data)"
          />
        </span>
        <span v-else class="tree-node-meta">
          <el-tag :type="data.isActive ? 'success' : 'info'" size="mini">
            {{ data.statusLabel }}
          </el-tag>
        </span>
        <span v-if="data.nodeType !== 'DIRECTORY'" class="tree-node-actions" @click.stop>
          <el-button
            v-if="data.nodeType !== 'DIRECTORY'"
            v-permission="data.isActive ? 'system.page.disable' : 'system.page.enable'"
            type="text"
            class="tree-inline-action"
            :icon="data.isActive ? 'el-icon-video-pause' : 'el-icon-video-play'"
            :title="data.isActive ? '停用页面' : '启用页面'"
            @click="$emit('toggle-status', data)"
          />
          <el-button
            v-if="data.nodeType !== 'DIRECTORY'"
            v-permission="'system.page.delete'"
            type="text"
            class="tree-inline-action tree-inline-action-danger"
            icon="el-icon-delete"
            title="删除页面"
            @click="$emit('delete-page', data)"
          />
        </span>
      </span>
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
  },
  methods: {
    selectNode(data) {
      this.$emit('select', data)
    },
    setCurrentKey(id) {
      this.$refs.pageTree?.setCurrentKey(id)
    },
  },
}
</script>

<style scoped>
.page-panel {
  width: 280px;
  border-right: 1px solid #ebeef5;
  padding-right: 16px;
}
.page-panel-head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 16px;
}
.refresh-button {
  width: 38px;
  padding: 0;
}
.page-tree {
  margin-top: 10px;
}
.tree-node-actions {
  margin-left: 10px;
}
.tree-inline-action {
  height: 24px;
  padding: 0;
  color: #909399;
  line-height: 24px;
  vertical-align: middle;
}
.tree-inline-action:hover {
  color: #1677ff;
  background: #ecf5ff;
  border-radius: 3px;
}
.tree-inline-action-danger:hover {
  color: #f56c6c;
  background: #fef0f0;
}
.tree-node-meta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
  box-sizing: border-box;
}
.tree-directory-link {
  padding: 0;
  margin: 0;
  color: #409eff;
  font-size: 12px;
}
.page-tree /deep/ .el-tree-node__content {
  position: relative;
  height: 30px;
  width: 100%;
  padding-right: 4px;
  box-sizing: border-box;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}
.page-tree /deep/ .el-tree-node__content:hover {
  background: #f5f9ff;
}
.page-tree /deep/ .el-tree-node.is-current > .el-tree-node__content {
  color: #1677ff;
  font-weight: 500;
  background: #ecf5ff;
}
.page-tree /deep/ .el-tree-node__children {
  position: relative;
  margin-left: 0;
  padding-left: 14px;
}
.page-tree /deep/ .el-tree-node__children > .el-tree-node {
  position: relative;
}
.page-tree /deep/ .el-tree-node__children::before {
  position: absolute;
  top: 0;
  bottom: 15px;
  left: 6px;
  width: 1px;
  content: '';
  background: #e4e7ed;
}
.page-tree /deep/ .el-tree-node__children > .el-tree-node > .el-tree-node__content::after {
  position: absolute;
  top: 50%;
  left: -6px;
  width: 10px;
  height: 1px;
  content: '';
  background: #e4e7ed;
}
.page-tree /deep/ .el-tree-node__expand-icon.is-leaf {
  width: 0;
  padding: 0;
  margin: 0;
  visibility: hidden;
}
.page-tree /deep/ .el-tree-node__expand-icon:not(.is-leaf) {
  width: 14px;
  padding: 0;
  margin-right: 4px;
  text-align: center;
}
.tree-node {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.tree-node-icon {
  color: #8a94a6;
  margin-right: 4px;
}
.tree-node-name {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
