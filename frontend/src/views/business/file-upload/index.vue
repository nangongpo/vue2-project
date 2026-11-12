<template>
  <div class="page-container">
    <el-card shadow="never">
      <h2>业务文件上传</h2>
      <p class="hint">上传文件会先进入隔离区，后端完成完整性校验和安全扫描后，业务方才可使用。</p>
      <file-uploader
        purpose="business-document"
        resource-type="business.document"
        field-name="attachment"
        @file-selected="handleFileSelected"
        @status-change="handleStatusChange"
        @uploaded="handleUploaded" />
      <el-alert
        v-if="statusMessage"
        :title="statusMessage"
        :type="statusTone"
        :closable="false"
        show-icon
        class="status-tip" />
    </el-card>
  </div>
</template>

<script>
import FileUploader from '@/components/FileUploader.vue'

export default {
  name: 'BusinessFileUpload',
  components: { FileUploader },
  data() {
    return { statusMessage: '', statusTone: 'info' }
  },
  methods: {
    handleFileSelected() {
      this.statusMessage = ''
      this.statusTone = 'info'
    },
    handleUploaded() {
      this.statusMessage = '上传已提交，等待安全扫描完成。'
      this.statusTone = 'info'
    },
    handleStatusChange(payload, state) {
      this.statusMessage = state.text
      this.statusTone = state.tone
      this.$emit('file-status-change', payload, state)
    },
  },
}
</script>

<style lang="scss" scoped>
.page-container { padding: 20px; }
h2 { margin: 0 0 12px; color: #1f2937; }
.hint { color: #64748b; line-height: 1.6; }
.status-tip { margin-top: 16px; }
</style>
