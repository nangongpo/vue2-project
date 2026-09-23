<template>
  <div class="page-container">
    <el-card shadow="never">
      <div class="page-title">当前账号的登录会话</div>
      <el-table v-loading="loading" :data="sessions" border stripe>
        <el-table-column label="状态" width="100"><template slot-scope="scope"><el-tag :type="scope.row.current ? 'success' : 'info'">{{ scope.row.current ? '当前会话' : '其他设备' }}</el-tag></template></el-table-column>
        <el-table-column prop="ip" label="登录地址" width="100" />
        <el-table-column prop="userAgent" label="设备信息" min-width="300" show-overflow-tooltip />
        <el-table-column label="登录时间" width="150"><template slot-scope="scope">{{ formatDate(scope.row.createdAt) }}</template></el-table-column>
        <el-table-column label="最近活跃" width="150"><template slot-scope="scope">{{ formatDate(scope.row.lastSeenAt) }}</template></el-table-column>
        <el-table-column label="过期时间" width="150"><template slot-scope="scope">{{ formatDate(scope.row.expiresAt) }}</template></el-table-column>
        <el-table-column label="操作" min-width="100"><template slot-scope="scope"><el-button type="text" :disabled="scope.row.current" @click="revoke(scope.row)">撤销</el-button></template></el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script>
import { getSessions, revokeSession } from '@/api/user'
import { dateFormat } from '@/utils/date'

export default {
  name: 'SystemSession',
  data() { return { loading: false, sessions: [] } },
  created() { this.loadSessions() },
  methods: {
    formatDate(value) {
      return dateFormat(value) || '未知'
    },
    async loadSessions() {
      this.loading = true
      try { this.sessions = await getSessions() || [] } finally { this.loading = false }
    },
    async revoke(session) {
      await this.$confirm('确认撤销该登录会话？', '提示', { type: 'warning' })
      await revokeSession(session.id)
      this.$message.success('会话已撤销')
      await this.loadSessions()
    }
  }
}
</script>

<style lang="scss" scoped>
.page-container { padding: 20px; }
.page-title { margin-bottom: 16px; font-size: 16px; font-weight: 600; }
</style>
