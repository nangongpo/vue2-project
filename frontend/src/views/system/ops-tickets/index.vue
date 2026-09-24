<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="notice">
        应急工单仅用于在线审批不可用或必须立即处理的生产故障。正常权限变更请优先使用受控审批。
      </div>
      <div class="toolbar">
        <el-select v-model="query.status" clearable placeholder="全部状态" @change="load">
          <el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value" />
        </el-select>
        <el-select v-model="query.type" clearable placeholder="全部类型" @change="load">
          <el-option
            v-for="item in typeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value" />
        </el-select>
        <el-select v-model="query.riskLevel" clearable placeholder="全部风险" @change="load">
          <el-option v-for="item in riskOptions" :key="item" :label="item" :value="item" />
        </el-select>
        <el-button :loading="loading" @click="load">刷新</el-button>
        <el-button
          v-if="can('system.ops-ticket.create')"
          type="primary"
          @click="$router.push('/system/ops-tickets/create')">
          新建工单
        </el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <el-table v-loading="loading" :data="items" border stripe>
        <el-table-column prop="ticketNo" label="工单号" min-width="190" />
        <el-table-column label="类型" width="160">
          <template slot-scope="scope">{{ labelOf(typeOptions, scope.row.type) }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
        <el-table-column label="风险" width="90">
          <template slot-scope="scope"
            ><el-tag :type="riskType(scope.row.riskLevel)">{{
              scope.row.riskLevel
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="状态" width="105">
          <template slot-scope="scope"
            ><el-tag>{{ labelOf(statusOptions, scope.row.status) }}</el-tag></template
          >
        </el-table-column>
        <el-table-column prop="requestedBy" label="申请人" min-width="180" show-overflow-tooltip />
        <el-table-column prop="createdAt" label="创建时间" min-width="175" />
        <el-table-column label="操作" width="90" fixed="right">
          <template slot-scope="scope"
            ><el-button type="text" @click="$router.push(`/system/ops-tickets/${scope.row.id}`)"
              >详情</el-button
            ></template
          >
        </el-table-column>
      </el-table>
      <el-pagination
        class="pagination"
        background
        layout="total, prev, pager, next"
        :current-page.sync="query.page"
        :page-size="query.pageSize"
        :total="total"
        @current-change="load" />
    </el-card>
  </div>
</template>

<script>
import { getOpsTickets } from '@/api/admin'

export default {
  name: 'SystemOpsTickets',
  data() {
    return {
      loading: false,
      error: '',
      items: [],
      total: 0,
      query: { status: '', type: '', riskLevel: '', page: 1, pageSize: 20 },
      riskOptions: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      statusOptions: [
        { value: 'DRAFT', label: '草稿' },
        { value: 'SUBMITTED', label: '待确认' },
        { value: 'APPROVED', label: '待执行' },
        { value: 'EXECUTED', label: '待复核' },
        { value: 'REVIEWED', label: '已归档' },
        { value: 'REJECTED', label: '已拒绝' },
        { value: 'CANCELLED', label: '已取消' },
      ],
      typeOptions: [
        { value: 'MFA_RESET_EMERGENCY', label: 'MFA 应急重置' },
        { value: 'DB_MANUAL_FIX', label: '数据库手工修复' },
        { value: 'PERMISSION_RECOVERY', label: '权限恢复' },
        { value: 'ACCOUNT_RECOVERY', label: '账户恢复' },
        { value: 'OTHER', label: '其他' },
      ],
    }
  },
  created() {
    this.load()
  },
  methods: {
    can(code) {
      return (this.$store.getters.menu_list || []).includes(code)
    },
    labelOf(options, value) {
      return options.find((item) => item.value === value)?.label || value
    },
    riskType(value) {
      return value === 'CRITICAL' || value === 'HIGH'
        ? 'danger'
        : value === 'MEDIUM'
        ? 'warning'
        : 'info'
    },
    async load() {
      this.loading = true
      this.error = ''
      try {
        const result = await getOpsTickets({
          ...this.query,
          status: this.query.status || undefined,
          type: this.query.type || undefined,
          riskLevel: this.query.riskLevel || undefined,
        })
        this.items = result.items || []
        this.total = result.total || 0
      } catch (error) {
        this.items = []
        this.total = 0
        this.error = error.message || '工单列表加载失败'
      } finally {
        this.loading = false
      }
    },
  },
}
</script>

<style scoped>
.toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 16px 0;
}
.notice {
  padding: 12px 16px;
  color: #856404;
  background: #fff8e1;
  border: 1px solid #ffe08a;
  border-radius: 4px;
}
.pagination {
  margin-top: 16px;
  text-align: right;
}
.el-alert {
  margin-bottom: 16px;
}
</style>
