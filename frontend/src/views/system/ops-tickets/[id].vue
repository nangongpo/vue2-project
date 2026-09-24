<template>
  <div class="page-container">
    <el-card v-loading="loading" shadow="never">
      <div slot="header">
        <span>运维应急工单详情</span
        ><el-button class="back" type="text" @click="$router.back()">返回列表</el-button>
      </div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" />
      <template v-if="ticket">
        <div class="summary">
          <el-tag :type="riskType(ticket.riskLevel)">{{ ticket.riskLevel }}</el-tag>
          <el-tag>{{ labelOf(statusOptions, ticket.status) }}</el-tag>
          <span class="ticket-no">{{ ticket.ticketNo }}</span>
        </div>
        <el-descriptions :column="2" border size="small">
          <el-descriptions-item label="标题" :span="2">{{ ticket.title }}</el-descriptions-item>
          <el-descriptions-item label="类型">{{
            labelOf(typeOptions, ticket.type)
          }}</el-descriptions-item>
          <el-descriptions-item label="目标"
            >{{ ticket.targetType }} / {{ ticket.targetId || '—' }}</el-descriptions-item
          >
          <el-descriptions-item label="申请人">{{ ticket.requestedBy }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ ticket.createdAt }}</el-descriptions-item>
          <el-descriptions-item label="申请原因" :span="2">{{
            ticket.reason
          }}</el-descriptions-item>
          <el-descriptions-item label="线下依据" :span="2">{{
            ticket.offlineBasis
          }}</el-descriptions-item>
          <el-descriptions-item label="身份核验">{{
            ticket.identityVerification
          }}</el-descriptions-item>
          <el-descriptions-item label="外部依据">{{
            ticket.externalRef || '未提供'
          }}</el-descriptions-item>
          <el-descriptions-item label="线下批准人">{{
            ticket.offlineApprover
          }}</el-descriptions-item>
          <el-descriptions-item label="线下复核人">{{
            ticket.offlineReviewer
          }}</el-descriptions-item>
        </el-descriptions>
        <div class="actions">
          <el-button
            v-if="ticket.status === 'DRAFT' && can('system.ops-ticket.create')"
            type="primary"
            :loading="saving"
            @click="submitTicket"
            >提交确认</el-button
          >
          <el-button
            v-if="ticket.status === 'SUBMITTED' && can('system.ops-ticket.approve')"
            :loading="saving"
            @click="transition('approve')"
            >确认工单</el-button
          >
          <el-button
            v-if="ticket.status === 'APPROVED' && can('system.ops-ticket.execute')"
            type="warning"
            :loading="saving"
            @click="transition('execute')"
            >确认执行</el-button
          >
          <el-button
            v-if="ticket.status === 'EXECUTED' && can('system.ops-ticket.executions')"
            :loading="saving"
            @click="executionVisible = true"
            >回写执行记录</el-button
          >
          <el-button
            v-if="ticket.status === 'EXECUTED' && can('system.ops-ticket.review')"
            type="success"
            :loading="saving"
            @click="transition('review')"
            >审计复核归档</el-button
          >
          <el-button
            v-if="['DRAFT', 'SUBMITTED'].includes(ticket.status) && can('system.ops-ticket.cancel')"
            type="danger"
            plain
            :loading="saving"
            @click="transition('cancel')"
            >取消工单</el-button
          >
          <el-button
            v-if="
              !['REVIEWED', 'CANCELLED'].includes(ticket.status) &&
              can('system.ops-ticket.evidence')
            "
            @click="evidenceVisible = true"
            >追加证据</el-button
          >
        </div>
        <el-divider>证据记录</el-divider>
        <el-table :data="ticket.evidence || []" border stripe empty-text="暂无证据">
          <el-table-column prop="type" label="类型" width="180" /><el-table-column
            prop="name"
            label="名称"
            min-width="180" /><el-table-column
            prop="uri"
            label="地址/摘要"
            min-width="260"
            show-overflow-tooltip /><el-table-column
            prop="uploadedBy"
            label="上传人"
            min-width="180" /><el-table-column prop="createdAt" label="时间" min-width="170" />
        </el-table>
        <el-divider>执行记录</el-divider>
        <el-table :data="ticket.executions || []" border stripe empty-text="暂无执行回写记录">
          <el-table-column prop="scriptName" label="脚本" min-width="180" /><el-table-column
            prop="scriptVersion"
            label="版本"
            width="120" /><el-table-column
            prop="operatorHost"
            label="主机"
            min-width="160" /><el-table-column
            prop="dbCurrentUser"
            label="数据库账号"
            min-width="160" /><el-table-column
            prop="result"
            label="结果"
            width="100" /><el-table-column
            prop="traceId"
            label="Trace ID"
            min-width="180" /><el-table-column prop="executedAt" label="执行时间" min-width="170" />
        </el-table>
      </template>
    </el-card>

    <el-dialog
      title="追加执行记录"
      :visible.sync="executionVisible"
      width="720px"
      :close-on-click-modal="false">
      <el-form :model="execution" label-width="125px">
        <el-form-item label="工单号"
          ><el-input v-model="execution.ticketNo" disabled
        /></el-form-item>
        <el-form-item label="OS 用户"
          ><el-input v-model.trim="execution.operatorOsUser" /></el-form-item
        ><el-form-item label="主机名"
          ><el-input v-model.trim="execution.operatorHost" /></el-form-item
        ><el-form-item label="数据库账号"
          ><el-input v-model.trim="execution.dbCurrentUser"
        /></el-form-item>
        <el-form-item label="脚本名称"
          ><el-input v-model.trim="execution.scriptName" /></el-form-item
        ><el-form-item label="脚本版本"
          ><el-input v-model.trim="execution.scriptVersion" /></el-form-item
        ><el-form-item label="命令摘要 SHA256"
          ><el-input v-model.trim="execution.commandHash" maxlength="64"
        /></el-form-item>
        <el-form-item label="结果"
          ><el-radio-group v-model="execution.result"
            ><el-radio label="SUCCESS">成功</el-radio
            ><el-radio label="FAILED">失败</el-radio></el-radio-group
          ></el-form-item
        ><el-form-item label="Trace ID"><el-input v-model.trim="execution.traceId" /></el-form-item>
        <el-form-item label="前快照 JSON"
          ><el-input
            v-model="execution.beforeSnapshotText"
            type="textarea"
            :rows="2" /></el-form-item
        ><el-form-item label="后快照 JSON"
          ><el-input v-model="execution.afterSnapshotText" type="textarea" :rows="2"
        /></el-form-item>
      </el-form>
      <span slot="footer"
        ><el-button @click="executionVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="addExecution"
          >保存记录</el-button
        ></span
      >
    </el-dialog>
    <el-dialog title="追加证据" :visible.sync="evidenceVisible" width="560px">
      <el-form :model="evidence" label-width="100px"
        ><el-form-item label="类型"
          ><el-select v-model="evidence.type"
            ><el-option
              v-for="item in evidenceTypes"
              :key="item"
              :label="item"
              :value="item" /></el-select></el-form-item
        ><el-form-item label="名称"
          ><el-input v-model.trim="evidence.name" maxlength="255" /></el-form-item
        ><el-form-item label="地址/摘要"
          ><el-input v-model.trim="evidence.uri" type="textarea" maxlength="1024" /></el-form-item
        ><el-form-item label="SHA256"
          ><el-input v-model.trim="evidence.sha256" maxlength="64" /></el-form-item
      ></el-form>
      <span slot="footer"
        ><el-button @click="evidenceVisible = false">取消</el-button
        ><el-button type="primary" :loading="saving" @click="addEvidence">保存证据</el-button></span
      >
    </el-dialog>
  </div>
</template>

<script>
import {
  addOpsTicketEvidence,
  addOpsTicketExecution,
  approveOpsTicket,
  cancelOpsTicket,
  executeOpsTicket,
  getOpsTicket,
  reviewOpsTicket,
  submitOpsTicket,
} from '@/api/admin'
import { requestReason } from '../permission/utils'

export default {
  name: 'SystemOpsTicketDetail',
  data() {
    return {
      loading: false,
      saving: false,
      error: '',
      ticket: null,
      evidenceVisible: false,
      executionVisible: false,
      statusOptions: [
        { value: 'DRAFT', label: '草稿' },
        { value: 'SUBMITTED', label: '待确认' },
        { value: 'APPROVED', label: '待执行' },
        { value: 'EXECUTED', label: '待复核' },
        { value: 'REVIEWED', label: '已归档' },
        { value: 'CANCELLED', label: '已取消' },
      ],
      typeOptions: [
        { value: 'MFA_RESET_EMERGENCY', label: 'MFA 应急重置' },
        { value: 'DB_MANUAL_FIX', label: '数据库手工修复' },
        { value: 'PERMISSION_RECOVERY', label: '权限恢复' },
        { value: 'ACCOUNT_RECOVERY', label: '账户恢复' },
        { value: 'OTHER', label: '其他' },
      ],
      evidenceTypes: ['APPROVAL_SCREENSHOT', 'EMAIL', 'CHAT', 'SQL_REVIEW', 'OTHER'],
      evidence: { type: 'OTHER', name: '', uri: '', sha256: '' },
      execution: {
        ticketNo: '',
        operatorOsUser: '',
        operatorHost: '',
        dbCurrentUser: '',
        scriptName: '',
        scriptVersion: '',
        commandHash: '',
        result: 'SUCCESS',
        traceId: '',
        beforeSnapshotText: '',
        afterSnapshotText: '',
      },
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
        this.ticket = await getOpsTicket(this.$route.params.id)
        this.execution.ticketNo = this.ticket.ticketNo
      } catch (error) {
        this.error = error.message || '工单加载失败'
      } finally {
        this.loading = false
      }
    },
    async submitTicket() {
      this.saving = true
      try {
        await submitOpsTicket(this.ticket.id)
        this.$message.success('工单已提交确认')
        await this.load()
      } catch (error) {
        this.$message.error(error.message || '提交失败')
      } finally {
        this.saving = false
      }
    },
    async transition(action) {
      const note = await requestReason(
        this,
        {
          approve: '确认应急工单',
          execute: '确认执行工单',
          review: '审计复核工单',
          cancel: '取消应急工单',
        }[action],
        '请填写处理意见'
      )
      if (!note) return
      this.saving = true
      try {
        await {
          approve: approveOpsTicket,
          execute: executeOpsTicket,
          review: reviewOpsTicket,
          cancel: cancelOpsTicket,
        }[action](this.ticket.id, note)
        this.$message.success('操作成功')
        await this.load()
      } catch (error) {
        this.$message.error(error.message || '操作失败')
      } finally {
        this.saving = false
      }
    },
    async addEvidence() {
      if (!this.evidence.name || !this.evidence.uri)
        return this.$message.warning('请填写证据名称和地址/摘要')
      this.saving = true
      try {
        await addOpsTicketEvidence(this.ticket.id, this.evidence)
        this.evidenceVisible = false
        this.evidence = { type: 'OTHER', name: '', uri: '', sha256: '' }
        await this.load()
      } catch (error) {
        this.$message.error(error.message || '证据保存失败')
      } finally {
        this.saving = false
      }
    },
    async addExecution() {
      const required = [
        'operatorOsUser',
        'operatorHost',
        'dbCurrentUser',
        'scriptName',
        'scriptVersion',
        'commandHash',
        'traceId',
      ]
      if (required.some((key) => !this.execution[key]))
        return this.$message.warning('请完整填写执行环境和脚本信息')
      const parse = (value) => {
        if (!value.trim()) return undefined
        try {
          return JSON.parse(value)
        } catch {
          throw new Error('前后快照必须是有效 JSON')
        }
      }
      let beforeSnapshot, afterSnapshot
      try {
        beforeSnapshot = parse(this.execution.beforeSnapshotText)
        afterSnapshot = parse(this.execution.afterSnapshotText)
      } catch (error) {
        return this.$message.warning(error.message)
      }
      this.saving = true
      try {
        await addOpsTicketExecution(this.ticket.id, {
          ticketNo: this.execution.ticketNo,
          operatorOsUser: this.execution.operatorOsUser,
          operatorHost: this.execution.operatorHost,
          dbCurrentUser: this.execution.dbCurrentUser,
          scriptName: this.execution.scriptName,
          scriptVersion: this.execution.scriptVersion,
          commandHash: this.execution.commandHash,
          result: this.execution.result,
          traceId: this.execution.traceId,
          beforeSnapshot,
          afterSnapshot,
          dryRun: false,
        })
        this.executionVisible = false
        await this.load()
      } catch (error) {
        this.$message.error(error.message || '执行记录保存失败')
      } finally {
        this.saving = false
      }
    },
  },
}
</script>

<style scoped>
.back {
  float: right;
}
.summary {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 18px;
}
.ticket-no {
  color: #606266;
  font-family: monospace;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 20px 0;
}
.el-alert {
  margin-bottom: 16px;
}
</style>
