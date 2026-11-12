<template>
  <div class="file-uploader">
    <input ref="input" class="file-input" type="file" :accept="accept" @change="selectFile">
    <div class="file-uploader__actions">
      <button type="button" class="button" :disabled="busy" @click="chooseFile">选择文件</button>
      <button type="button" class="button primary" :disabled="!file || busy" @click="start">
        {{ busy ? '上传中…' : '开始上传' }}
      </button>
      <button type="button" class="button danger" :disabled="!uploadId || !busy" @click="abort">中止上传</button>
    </div>

    <div v-if="file" class="file-uploader__info">
      <div><span>文件：</span>{{ file.name }}</div>
      <div><span>大小：</span>{{ formatSize(file.size) }}</div>
      <div><span>上传会话：</span>{{ uploadId || '尚未创建' }}</div>
    </div>

    <div v-if="unfinishedUploads.length" class="file-uploader__resume">
      <strong>可继续的上传</strong>
      <div v-for="session in unfinishedUploads" :key="session.uploadId" class="resume-item">
        <span>{{ session.fileName }}（{{ formatSize(Number(session.fileSize)) }}）</span>
        <button type="button" class="button" :disabled="!canResume(session) || busy" @click="useUploadSession(session)">
          {{ canResume(session) ? '继续上传' : '需重新选择原文件' }}
        </button>
      </div>
    </div>

    <div v-if="uploadId" class="file-uploader__progress">
      <div class="progress-track"><div class="progress-value" :style="{ width: `${progress}%` }"></div></div>
      <div class="progress-line"><span>{{ progress }}%</span><span>{{ statusText }}</span></div>
    </div>

    <div v-if="message" class="file-uploader__message" :class="messageType">{{ message }}</div>
  </div>
</template>

<script>
import {
  abortFileUpload,
  completeFileUpload,
  getFileUploadStatus,
  getUnfinishedFileUploads,
  initiateFileUpload,
  uploadFilePart,
} from '@/api/file-upload'
import { EventStreamClient } from '@/utils/event-stream-client'
import { resolveFileUploadStatus } from '@/constants/file-upload-status'

const DEFAULT_MAX_RETRY = 3

export default {
  name: 'FileUploader',
  props: {
    purpose: { type: String, required: true },
    resourceType: { type: String, default: '' },
    resourceId: { type: String, default: '' },
    fieldName: { type: String, default: '' },
    accept: { type: String, default: '' },
    maxRetry: { type: Number, default: DEFAULT_MAX_RETRY },
  },
  data() {
    return {
      file: null,
      uploadId: '',
      chunkSize: 0,
      totalParts: 0,
      completedParts: {},
      busy: false,
      progress: 0,
      statusText: '待上传',
      message: '',
      messageType: 'info',
      unfinishedUploads: [],
      pollTimer: null,
      uploadEvents: null,
      statusFallbackTimer: null,
    }
  },
  mounted() {
    this.loadUnfinishedUploads()
  },
  beforeDestroy() {
    this.stopStatusTracking()
  },
  methods: {
    chooseFile() { this.$refs.input.click() },
    selectFile(event) {
      this.stopStatusTracking()
      const files = event.target.files || []
      this.file = files[0] || null
      this.uploadId = ''
      this.completedParts = {}
      this.progress = 0
      this.chunkSize = 0
      this.totalParts = 0
      this.statusText = '待上传'
      this.message = this.file ? '文件已选择，可以开始上传。' : ''
      this.messageType = 'info'
      this.loadUnfinishedUploads()
      this.$emit('file-selected', this.file)
    },
    async start() {
      if (!this.file || this.busy) return
      this.busy = true
      this.message = ''
      try {
        if (!this.uploadId) this.applySession(await initiateFileUpload(this.buildInitiatePayload()))
        await this.resumeUpload()
      } catch (error) {
        this.showError(error)
      } finally {
        this.busy = false
      }
    },
    buildInitiatePayload() {
      const payload = {
        fileName: this.file.name,
        fileSize: this.file.size,
        declaredMime: this.file.type || undefined,
        purpose: this.purpose,
      }
      if (this.resourceType) payload.resourceType = this.resourceType
      if (this.resourceId) payload.resourceId = this.resourceId
      if (this.fieldName) payload.fieldName = this.fieldName
      return payload
    },
    applySession(session) {
      this.uploadId = session.uploadId
      this.chunkSize = session.chunkSize
      this.totalParts = session.totalParts
    },
    async resumeUpload() {
      const status = await getFileUploadStatus(this.uploadId)
      this.chunkSize = status.chunkSize
      this.totalParts = status.totalParts
      this.completedParts = (status.parts || []).reduce((result, part) => {
        result[part.partNumber] = true
        return result
      }, {})
      this.updateProgress()
      this.statusText = '断点续传中'
      for (let partNumber = 1; partNumber <= this.totalParts; partNumber += 1) {
        if (this.completedParts[partNumber]) continue
        await this.uploadPartWithRetry(partNumber)
        this.completedParts = { ...this.completedParts, [partNumber]: true }
        this.updateProgress()
      }
      this.statusText = '正在校验并进入安全扫描'
      const result = await completeFileUpload(this.uploadId)
      this.statusText = '已提交，等待安全扫描'
      this.message = '上传完成，文件正在安全扫描。'
      this.messageType = 'success'
      this.$emit('uploaded', result)
      this.startStatusTracking()
    },
    async uploadPartWithRetry(partNumber) {
      const start = (partNumber - 1) * this.chunkSize
      const blob = this.file.slice(start, Math.min(this.file.size, start + this.chunkSize))
      let lastError
      for (let attempt = 0; attempt <= this.maxRetry; attempt += 1) {
        try {
          await uploadFilePart(this.uploadId, partNumber, blob)
          return
        } catch (error) {
          lastError = error
          this.statusText = `第 ${partNumber} 片失败，重试 ${attempt + 1}/${this.maxRetry}`
          if (attempt < this.maxRetry) await this.delay(Math.min(1000 * (2 ** attempt), 8000))
        }
      }
      throw lastError
    },
    async abort() {
      if (!this.uploadId) return
      try {
        await abortFileUpload(this.uploadId)
        this.stopStatusTracking()
        this.busy = false
        this.statusText = '已中止'
        this.message = '上传会话已中止。'
        this.messageType = 'info'
        this.$emit('aborted', this.uploadId)
      } catch (error) {
        this.showError(error)
      }
    },
    updateProgress() {
      this.progress = this.totalParts ? Math.floor((Object.keys(this.completedParts).length / this.totalParts) * 100) : 0
    },
    startStatusTracking() {
      this.stopStatusTracking()
      const fallback = () => { this.stopEvents(); void this.pollStatus() }
      const client = new EventStreamClient({
        path: `/files/uploads/${this.uploadId}/events`,
        events: {
          snapshot: (status) => this.handleStatus(status),
          'file.upload.status.changed': (status) => this.handleStatus(status),
          message: (status) => this.handleStatus(status),
        },
        onOpen: () => this.clearFallbackTimer(),
        onUnavailable: fallback,
        onError: fallback,
      })
      if (!client.connect()) return
      this.uploadEvents = client
      this.statusFallbackTimer = setTimeout(fallback, 15000)
    },
    async pollStatus() {
      while (this.uploadId) {
        const status = await getFileUploadStatus(this.uploadId)
        this.handleStatus(status)
        if (resolveFileUploadStatus(status).terminal) return
        await new Promise((resolve) => { this.pollTimer = setTimeout(resolve, 2000) })
        this.pollTimer = null
      }
    },
    handleStatus(status) {
      const payload = status && status.data && typeof status.data === 'object' ? status.data : status
      const state = resolveFileUploadStatus(payload)
      this.statusText = state.text
      this.message = state.text
      this.messageType = state.tone
      this.$emit('status-change', payload, state)
      if (state.terminal) this.stopStatusTracking()
    },
    async loadUnfinishedUploads() {
      try {
        const result = await getUnfinishedFileUploads()
        this.unfinishedUploads = Array.isArray(result) ? result : []
      } catch { this.unfinishedUploads = [] }
    },
    canResume(session) { return Boolean(this.file && this.file.name === session.fileName && this.file.size === Number(session.fileSize)) },
    useUploadSession(session) {
      if (!this.canResume(session)) return
      this.uploadId = session.uploadId
      this.chunkSize = session.chunkSize
      this.totalParts = session.totalParts
      this.completedParts = (session.parts || []).reduce((result, part) => {
        result[part.partNumber] = true
        return result
      }, {})
      this.updateProgress()
      this.statusText = '可继续上传'
      this.message = '已选择服务端上传会话，请开始继续上传。'
      this.messageType = 'info'
    },
    stopStatusTracking() { this.stopPolling(); this.stopEvents() },
    clearFallbackTimer() {
      if (this.statusFallbackTimer) clearTimeout(this.statusFallbackTimer)
      this.statusFallbackTimer = null
    },
    stopEvents() {
      this.clearFallbackTimer()
      if (this.uploadEvents) this.uploadEvents.close()
      this.uploadEvents = null
    },
    stopPolling() {
      if (this.pollTimer) clearTimeout(this.pollTimer)
      this.pollTimer = null
    },
    showError(error) {
      this.message = error && error.message ? error.message : '上传失败'
      this.messageType = 'error'
      this.statusText = '失败，可重新点击开始上传继续'
      this.$emit('error', error)
    },
    delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)) },
    formatSize(value) {
      if (value < 1024) return `${value} B`
      if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
      if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
      return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
    },
  },
}
</script>

<style lang="scss" scoped>
.file-uploader { padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; }
.file-input { display: none; }
.file-uploader__actions { display: flex; gap: 8px; }
.button { padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; cursor: pointer; }
.button.primary { color: #fff; background: #2563eb; border-color: #2563eb; }
.button.danger { color: #b91c1c; }
.button:disabled { cursor: not-allowed; opacity: .5; }
.file-uploader__info, .file-uploader__resume { margin-top: 16px; padding: 12px; background: #f8fafc; line-height: 1.9; word-break: break-all; }
.file-uploader__info span { display: inline-block; width: 90px; color: #64748b; }
.resume-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.file-uploader__progress { margin-top: 20px; }
.progress-track { height: 10px; overflow: hidden; background: #e5e7eb; border-radius: 5px; }
.progress-value { height: 100%; background: #2563eb; transition: width .2s ease; }
.progress-line { display: flex; justify-content: space-between; margin-top: 8px; color: #475569; font-size: 13px; }
.file-uploader__message { margin-top: 16px; padding: 10px 12px; border-radius: 4px; }
.file-uploader__message.info { color: #1e40af; background: #eff6ff; }
.file-uploader__message.success { color: #166534; background: #f0fdf4; }
.file-uploader__message.error { color: #b91c1c; background: #fef2f2; }
</style>
