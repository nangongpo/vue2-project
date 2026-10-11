<template>
  <div class="upload-page">
    <div class="panel">
      <h2>大文件上传</h2>
      <p class="hint">支持分片、断点续传、失败重试。文件会先进入隔离区，后端完成安全扫描后才允许使用。</p>

      <input ref="fileInput" type="file" class="file-input" @change="selectFile">
      <button type="button" class="button" @click="chooseFile">选择文件</button>
      <button type="button" class="button primary" :disabled="!file || uploading" @click="startUpload">{{ uploading ? '上传中…' : '开始上传' }}</button>
      <button type="button" class="button danger" :disabled="!uploadId || !uploading" @click="abortUpload">中止上传</button>

      <div v-if="file" class="file-info">
        <div><span>文件：</span>{{ file.name }}</div>
        <div><span>大小：</span>{{ formatSize(file.size) }}</div>
        <div><span>服务端分片：</span>{{ formatSize(chunkSize) }}</div>
        <div><span>上传会话：</span>{{ uploadId || '尚未创建' }}</div>
      </div>

      <div v-if="unfinishedUploads.length" class="resume-list">
        <strong>未完成上传</strong>
        <div v-for="session in unfinishedUploads" :key="session.uploadId" class="resume-item">
          <span>{{ session.fileName }}（{{ formatSize(Number(session.fileSize)) }}）</span>
          <button type="button" class="button" :disabled="!canResume(session) || uploading" @click="useUploadSession(session)">
            {{ canResume(session) ? '使用此会话' : '请重新选择原文件' }}
          </button>
        </div>
      </div>

      <div v-if="uploadId" class="progress-wrap">
        <div class="progress-track"><div class="progress-value" :style="{ width: `${progress}%` }"></div></div>
        <div class="progress-line"><span>{{ progress }}%</span><span>{{ statusText }}</span></div>
      </div>

      <div v-if="message" class="message" :class="messageType">{{ message }}</div>
      <pre v-if="result" class="result">{{ result }}</pre>
    </div>

    <div class="panel file-list-panel">
      <div class="list-header">
        <h2>测试页上传的文件</h2>
        <button type="button" class="button" :disabled="fileListLoading" @click="loadFileList">刷新</button>
      </div>
      <div v-if="fileListLoading" class="list-empty">正在加载…</div>
      <div v-else-if="!fileItems.length" class="list-empty">暂无上传文件</div>
      <table v-else class="file-table">
        <thead>
          <tr><th>文件名</th><th>大小</th><th>文件状态</th><th>扫描状态</th><th>上传时间</th></tr>
        </thead>
        <tbody>
          <tr v-for="item in fileItems" :key="item.id">
            <td class="file-name">{{ item.originalName }}</td>
            <td>{{ formatSize(Number(item.size)) }}</td>
            <td>{{ item.statusLabel || '—' }}</td>
            <td>{{ item.scanStatusLabel || '—' }}</td>
            <td>{{ formatDate(item.createdAt) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="fileTotal" class="pagination-bar">
        <span>共 {{ fileTotal }} 个文件，第 {{ filePage }} / {{ fileTotalPages }} 页</span>
        <button type="button" class="button" :disabled="fileListLoading || filePage <= 1" @click="changeFilePage(filePage - 1)">上一页</button>
        <button type="button" class="button" :disabled="fileListLoading || filePage >= fileTotalPages" @click="changeFilePage(filePage + 1)">下一页</button>
      </div>
    </div>
  </div>
</template>

<script>
import {
  abortFileUpload,
  completeFileUpload,
  getUnfinishedFileUploads,
  getMyUploadedFiles,
  getFileUploadStatus,
  initiateFileUpload,
  uploadFilePart,
} from '@/api/file-upload'
import { EventStreamClient } from '@/utils/event-stream-client'
import { resolveFileUploadStatus } from '@/constants/file-upload-status'

const MAX_RETRY = 3
const FILE_STATUS_LABELS = Object.freeze({
  QUARANTINED: '隔离',
  READY: '可用',
  REJECTED: '拒绝',
  DELETED: '已删除',
})
const FILE_SCAN_STATUS_LABELS = Object.freeze({
  PENDING: '待扫描',
  CLEAN: '通过',
  INFECTED: '感染/违规',
  ERROR: '扫描异常',
})

export default {
  name: 'BusinessFileUpload',
  data() {
    return {
      file: null,
      uploadId: '',
      chunkSize: 0,
      totalParts: 0,
      completedParts: {},
      uploading: false,
      progress: 0,
      statusText: '待上传',
      message: '',
      messageType: 'info',
      result: '',
      fileItems: [],
      fileTotal: 0,
      filePage: 1,
      filePageSize: 10,
      fileTotalPages: 0,
      fileListLoading: false,
      fileListRefreshPending: false,
      unfinishedUploads: [],
      pollTimer: null,
      pollDelay: 2000,
      uploadEvents: null,
      statusFallbackTimer: null,
    }
  },
  mounted() {
    this.loadFileList()
    this.loadUnfinishedUploads()
  },
  beforeDestroy() {
    this.stopUploadStatusTracking()
  },
  methods: {
    chooseFile() {
      this.$refs.fileInput.click()
    },
    selectFile(event) {
      this.stopUploadStatusTracking()
      const files = event.target.files || []
      this.file = files[0] || null
      this.uploadId = ''
      this.completedParts = {}
      this.progress = 0
      this.result = ''
      this.message = this.file ? '文件已选择，可以开始上传。' : ''
      this.messageType = 'info'
      this.chunkSize = 0
      this.loadUnfinishedUploads()
    },
    async startUpload() {
      if (!this.file || this.uploading) return
      this.uploading = true
      this.message = ''
      try {
        if (this.uploadId) {
          await this.resumeUpload()
          return
        }
        const session = await initiateFileUpload({
          fileName: this.file.name,
          fileSize: this.file.size,
          declaredMime: this.file.type || undefined,
          purpose: 'business-file-upload-test',
        })
        this.uploadId = session.uploadId
        this.chunkSize = session.chunkSize
        this.totalParts = session.totalParts
        await this.resumeUpload()
      } catch (error) {
        this.showError(error)
      } finally {
        this.uploading = false
      }
    },
    async resumeUpload() {
      const status = await getFileUploadStatus(this.uploadId)
      this.chunkSize = status.chunkSize
      this.totalParts = status.totalParts
      const received = (status.parts || []).reduce((map, part) => {
        map[part.partNumber] = true
        return map
      }, {})
      this.completedParts = received
      this.updateProgress()
      this.statusText = '断点续传中'
      for (let partNumber = 1; partNumber <= this.totalParts; partNumber += 1) {
        if (this.completedParts[partNumber]) continue
        await this.uploadPartWithRetry(partNumber)
        this.completedParts = { ...this.completedParts, [partNumber]: true }
        this.updateProgress()
      }
      this.statusText = '正在校验并进入安全扫描'
      const completed = await completeFileUpload(this.uploadId)
      this.statusText = '已提交，等待安全扫描'
      this.result = JSON.stringify(completed, null, 2)
      this.message = '分片上传完成，文件正在安全扫描。'
      this.messageType = 'success'
      this.startUploadStatusTracking()
    },
    async uploadPartWithRetry(partNumber) {
      const start = (partNumber - 1) * this.chunkSize
      const end = Math.min(this.file.size, start + this.chunkSize)
      const blob = this.file.slice(start, end)
      let lastError
      for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
        try {
          await uploadFilePart(this.uploadId, partNumber, blob)
          return
        } catch (error) {
          lastError = error
          this.statusText = `第 ${partNumber} 片失败，重试 ${attempt + 1}/${MAX_RETRY}`
          if (attempt < MAX_RETRY) await this.delay(Math.min(1000 * (2 ** attempt), 8000))
        }
      }
      throw lastError
    },
    async abortUpload() {
      if (!this.uploadId) return
      try {
        await abortFileUpload(this.uploadId)
        this.stopUploadStatusTracking()
        this.uploading = false
        this.statusText = '已中止'
        this.message = '上传会话已中止。'
        this.messageType = 'info'
      } catch (error) {
        this.showError(error)
      }
    },
    updateProgress() {
      this.progress = this.totalParts ? Math.floor((Object.keys(this.completedParts).length / this.totalParts) * 100) : 0
    },
    async pollUploadStatus() {
      this.stopUploadPolling()
      this.pollDelay = 2000
      while (this.uploadId) {
        const status = await getFileUploadStatus(this.uploadId)
        this.result = JSON.stringify(status, null, 2)
        const state = resolveFileUploadStatus(status)
        this.statusText = state.text
        if (!this.applyUploadStatusToFileList(status)) await this.refreshFileList()
        if (state.terminal) return
        await new Promise((resolve) => {
          this.pollTimer = setTimeout(resolve, this.pollDelay)
        })
        this.pollTimer = null
        this.pollDelay = Math.min(5000, this.pollDelay + 1000)
      }
    },
    startUploadStatusTracking() {
      this.stopUploadPolling()
      this.stopUploadEvents()
      const fallback = () => {
        this.stopUploadEvents()
        void this.pollUploadStatus()
      }
      const client = new EventStreamClient({
        path: `/files/uploads/${this.uploadId}/events`,
        events: {
          snapshot: (status) => this.handleUploadStatus(status),
          'file.upload.status.changed': (status) => this.handleUploadStatus(status),
          message: (status) => this.handleUploadStatus(status),
        },
        onOpen: () => this.clearStatusFallbackTimer(),
        onUnavailable: fallback,
        onError: fallback,
      })
      if (!client.connect()) return
      this.uploadEvents = client
      this.statusFallbackTimer = setTimeout(fallback, 15000)
    },
    handleUploadStatus(status) {
      const payload = status && status.data && typeof status.data === 'object' ? status.data : status
      this.result = JSON.stringify(payload, null, 2)
      const state = resolveFileUploadStatus(payload)
      this.statusText = state.text
      if (!this.applyUploadStatusToFileList(payload)) void this.refreshFileList()
      if (state.terminal) this.stopUploadStatusTracking()
    },
    stopUploadStatusTracking() {
      this.stopUploadPolling()
      this.stopUploadEvents()
    },
    clearStatusFallbackTimer() {
      if (this.statusFallbackTimer) clearTimeout(this.statusFallbackTimer)
      this.statusFallbackTimer = null
    },
    stopUploadEvents() {
      this.clearStatusFallbackTimer()
      if (this.uploadEvents) this.uploadEvents.close()
      this.uploadEvents = null
    },
    stopUploadPolling() {
      if (this.pollTimer) clearTimeout(this.pollTimer)
      this.pollTimer = null
    },
    async loadFileList() {
      if (this.fileListLoading) return
      this.fileListLoading = true
      try {
        const result = await getMyUploadedFiles({ page: this.filePage, pageSize: this.filePageSize })
        this.fileItems = result.items || []
        this.fileTotal = Number(result.total || 0)
        this.fileTotalPages = Number(result.totalPages || 0)
      } catch (error) {
        this.showError(error)
      } finally {
        this.fileListLoading = false
        if (this.fileListRefreshPending) {
          this.fileListRefreshPending = false
          void this.loadFileList()
        }
      }
    },
    refreshFileList() {
      if (this.fileListLoading) {
        this.fileListRefreshPending = true
        return Promise.resolve()
      }
      return this.loadFileList()
    },
    applyUploadStatusToFileList(status) {
      if (!status || !status.fileId) return false
      const index = this.fileItems.findIndex((item) => item.id === status.fileId)
      if (index < 0) return false
      const fileStatus = status.fileStatus || this.fileItems[index].status
      const scanStatus = status.scanStatus || this.fileItems[index].scanStatus
      this.$set(this.fileItems, index, {
        ...this.fileItems[index],
        status: fileStatus,
        statusLabel: FILE_STATUS_LABELS[fileStatus] || this.fileItems[index].statusLabel,
        scanStatus,
        scanStatusLabel: FILE_SCAN_STATUS_LABELS[scanStatus] || this.fileItems[index].scanStatusLabel,
      })
      return true
    },
    async loadUnfinishedUploads() {
      try {
        const result = await getUnfinishedFileUploads()
        this.unfinishedUploads = Array.isArray(result) ? result : []
      } catch {
        this.unfinishedUploads = []
      }
    },
    canResume(session) {
      return Boolean(this.file && this.file.name === session.fileName && this.file.size === Number(session.fileSize))
    },
    useUploadSession(session) {
      if (!this.canResume(session)) return
      this.uploadId = session.uploadId
      this.chunkSize = session.chunkSize
      this.totalParts = session.totalParts
      this.completedParts = (session.parts || []).reduce((map, part) => {
        map[part.partNumber] = true
        return map
      }, {})
      this.updateProgress()
      this.statusText = '可继续上传'
      this.message = '已选择服务端上传会话，请确认文件后开始继续上传。'
      this.messageType = 'info'
    },
    async changeFilePage(page) {
      if (page < 1 || (this.fileTotalPages && page > this.fileTotalPages)) return
      this.filePage = page
      await this.loadFileList()
    },
    formatDate(value) {
      if (!value) return '-'
      return new Date(value).toLocaleString()
    },
    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms))
    },
    showError(error) {
      this.message = error && error.message ? error.message : '上传失败'
      this.messageType = 'error'
      this.statusText = '失败，可重新点击开始上传继续'
    },
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
.upload-page { padding: 24px; }
.panel { padding: 24px; background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; }
h2 { margin: 0 0 12px; color: #1f2937; }
.hint { margin: 0 0 20px; color: #6b7280; line-height: 1.6; }
.file-input { display: none; }
.button { margin-right: 8px; padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 4px; background: #fff; cursor: pointer; }
.button.primary { color: #fff; background: #2563eb; border-color: #2563eb; }
.button.danger { color: #b91c1c; }
.button:disabled { cursor: not-allowed; opacity: .5; }
.file-info { margin-top: 20px; padding: 12px; background: #f8fafc; line-height: 1.9; word-break: break-all; }
.file-info span { display: inline-block; width: 90px; color: #64748b; }
.progress-wrap { margin-top: 20px; }
.progress-track { height: 10px; overflow: hidden; background: #e5e7eb; border-radius: 5px; }
.progress-value { height: 100%; background: #2563eb; transition: width .2s ease; }
.progress-line { display: flex; justify-content: space-between; margin-top: 8px; color: #475569; font-size: 13px; }
.message { margin-top: 16px; padding: 10px 12px; border-radius: 4px; }
.message.info { color: #1e40af; background: #eff6ff; }
.message.success { color: #166534; background: #f0fdf4; }
.message.error { color: #b91c1c; background: #fef2f2; }
.result { max-height: 260px; overflow: auto; margin-top: 16px; padding: 12px; background: #111827; color: #d1fae5; }
.file-list-panel { margin-top: 20px; max-width: 1000px; }
.list-header { display: flex; align-items: center; justify-content: space-between; }
.list-header h2 { margin: 0; }
.list-empty { padding: 24px 0; color: #64748b; text-align: center; }
.file-table { width: 100%; border-collapse: collapse; color: #334155; font-size: 13px; }
.file-table th, .file-table td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; }
.file-table th { color: #64748b; font-weight: 600; }
.file-name { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pagination-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 14px; color: #64748b; font-size: 13px; }
</style>
