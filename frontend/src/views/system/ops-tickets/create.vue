<template>
  <div class="page-container">
    <el-card shadow="never">
      <div slot="header">
        <span>新建运维应急工单</span
        ><el-button class="back" type="text" @click="$router.back()">返回列表</el-button>
      </div>
      <el-alert
        title="必须填写线下依据、身份核验方式、线下批准人和线下复核人。外部审批编号仅作为补充证据。"
        type="warning"
        :closable="false" />
      <el-form ref="form" :model="form" :rules="rules" label-width="150px" class="ticket-form">
        <el-form-item label="工单类型" prop="type"
          ><el-select v-model="form.type"
            ><el-option
              v-for="item in typeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select
        ></el-form-item>
        <el-form-item label="风险等级" prop="riskLevel"
          ><el-select v-model="form.riskLevel"
            ><el-option
              v-for="item in riskOptions"
              :key="item"
              :label="item"
              :value="item" /></el-select
        ></el-form-item>
        <el-form-item label="标题" prop="title"
          ><el-input v-model.trim="form.title" maxlength="160" show-word-limit
        /></el-form-item>
        <el-form-item label="目标类型" prop="targetType"
          ><el-select v-model="form.targetType"
            ><el-option
              v-for="item in targetOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value" /></el-select
        ></el-form-item>
        <el-form-item v-if="form.targetType !== 'OTHER'" label="目标标识" prop="targetId"
          ><el-input
            v-model.trim="form.targetId"
            maxlength="128"
            placeholder="公开 UUID 或目标标识"
        /></el-form-item>
        <el-form-item label="申请原因" prop="reason"
          ><el-input
            v-model.trim="form.reason"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
        /></el-form-item>
        <el-form-item label="线下依据说明" prop="offlineBasis"
          ><el-input
            v-model.trim="form.offlineBasis"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
        /></el-form-item>
        <el-form-item label="身份核验方式" prop="identityVerification"
          ><el-input v-model.trim="form.identityVerification" maxlength="500"
        /></el-form-item>
        <el-form-item label="线下批准人" prop="offlineApprover"
          ><el-input v-model.trim="form.offlineApprover" maxlength="128"
        /></el-form-item>
        <el-form-item label="线下复核人" prop="offlineReviewer"
          ><el-input v-model.trim="form.offlineReviewer" maxlength="128"
        /></el-form-item>
        <el-form-item label="外部依据编号"
          ><el-input v-model.trim="form.externalRef" maxlength="128" placeholder="可选"
        /></el-form-item>
      </el-form>
      <div class="actions">
        <el-button @click="$router.back()">取消</el-button
        ><el-button type="primary" :loading="saving" @click="submit">保存草稿</el-button>
      </div>
    </el-card>
  </div>
</template>

<script>
import { createOpsTicket } from '@/api/admin'

const blank = () => ({
  type: 'OTHER',
  riskLevel: 'MEDIUM',
  title: '',
  reason: '',
  targetType: 'OTHER',
  targetId: '',
  offlineBasis: '',
  identityVerification: '',
  offlineApprover: '',
  offlineReviewer: '',
  externalRef: '',
})
export default {
  name: 'SystemOpsTicketCreate',
  data() {
    const required = (message) => ({ required: true, whitespace: true, message, trigger: 'blur' })
    return {
      saving: false,
      form: blank(),
      typeOptions: [
        { value: 'MFA_RESET_EMERGENCY', label: 'MFA 应急重置' },
        { value: 'DB_MANUAL_FIX', label: '数据库手工修复' },
        { value: 'PERMISSION_RECOVERY', label: '权限恢复' },
        { value: 'ACCOUNT_RECOVERY', label: '账户恢复' },
        { value: 'OTHER', label: '其他' },
      ],
      riskOptions: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      targetOptions: [
        { value: 'USER', label: '用户' },
        { value: 'ROLE', label: '角色' },
        { value: 'PERMISSION', label: '权限' },
        { value: 'DATABASE', label: '数据库' },
        { value: 'SYSTEM', label: '系统' },
        { value: 'OTHER', label: '其他' },
      ],
      rules: {
        type: required('请选择工单类型'),
        riskLevel: required('请选择风险等级'),
        title: required('请输入标题'),
        reason: required('请输入申请原因'),
        targetType: required('请选择目标类型'),
        targetId: required('请输入目标标识'),
        offlineBasis: required('请填写线下依据说明'),
        identityVerification: required('请填写身份核验方式'),
        offlineApprover: required('请填写线下批准人'),
        offlineReviewer: required('请填写线下复核人'),
      },
    }
  },
  methods: {
    async submit() {
      try {
        await this.$refs.form.validate()
      } catch {
        return
      }
      this.saving = true
      try {
        const data = await createOpsTicket({
          ...this.form,
          targetId: this.form.targetType === 'OTHER' ? undefined : this.form.targetId,
        })
        this.$message.success('工单草稿已保存')
        this.$router.replace(`/system/ops-tickets/${data.id}`)
      } catch (error) {
        this.$message.error(error.message || '保存失败')
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
.ticket-form {
  max-width: 820px;
  margin-top: 20px;
}
.ticket-form .el-select {
  width: 100%;
}
.actions {
  max-width: 820px;
  padding-left: 150px;
}
</style>
