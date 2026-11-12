import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import FileUploader from '@/components/FileUploader.vue'

const { api, eventClients } = vi.hoisted(() => ({
  api: {
    abortFileUpload: vi.fn(),
    completeFileUpload: vi.fn(),
    getFileUploadStatus: vi.fn(),
    getUnfinishedFileUploads: vi.fn(),
    initiateFileUpload: vi.fn(),
    uploadFilePart: vi.fn(),
  },
  eventClients: [],
}))

vi.mock('@/api/file-upload', () => api)

vi.mock('@/utils/event-stream-client', () => ({
  EventStreamClient: class {
    constructor(options) { this.options = options; this.close = vi.fn(); eventClients.push(this) }
    connect() { return this }
  },
}))

function createWrapper(props = {}) {
  return mount(FileUploader, {
    propsData: { purpose: 'business-document', ...props },
  })
}

describe('FileUploader component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    eventClients.length = 0
    api.getUnfinishedFileUploads.mockResolvedValue([])
  })

  it('builds a business-scoped initiate request without inventing missing bindings', async () => {
    const wrapper = createWrapper({ resourceType: 'business.document', fieldName: 'attachment' })
    const file = { name: 'report.pdf', size: 12, type: 'application/pdf' }
    wrapper.vm.file = file

    expect(wrapper.vm.buildInitiatePayload()).toEqual({
      fileName: 'report.pdf',
      fileSize: 12,
      declaredMime: 'application/pdf',
      purpose: 'business-document',
      resourceType: 'business.document',
      fieldName: 'attachment',
    })
  })

  it('only resumes a server session when the selected file matches exactly', () => {
    const wrapper = createWrapper()
    wrapper.vm.file = { name: 'report.pdf', size: 12 }
    const session = { uploadId: 'upload-1', fileName: 'report.pdf', fileSize: '12', chunkSize: 8, totalParts: 2, parts: [{ partNumber: 1 }] }

    expect(wrapper.vm.canResume(session)).toBe(true)
    wrapper.vm.useUploadSession(session)

    expect(wrapper.vm.uploadId).toBe('upload-1')
    expect(wrapper.vm.completedParts).toEqual({ 1: true })
    expect(wrapper.vm.progress).toBe(50)
    expect(wrapper.vm.canResume({ ...session, fileSize: '13' })).toBe(false)
  })

  it('returns the component to an idle retryable state and emits an error', async () => {
    const wrapper = createWrapper({ maxRetry: 0 })
    wrapper.vm.file = { name: 'report.pdf', size: 4, type: 'application/pdf', slice: () => new Blob(['test']) }
    api.initiateFileUpload.mockResolvedValue({ uploadId: 'upload-1', chunkSize: 8, totalParts: 1 })
    api.getFileUploadStatus.mockResolvedValue({ uploadId: 'upload-1', chunkSize: 8, totalParts: 1, parts: [] })
    api.uploadFilePart.mockRejectedValue(new Error('网络中断'))

    await wrapper.vm.start()

    expect(wrapper.vm.busy).toBe(false)
    expect(wrapper.vm.messageType).toBe('error')
    expect(wrapper.emitted('error')).toHaveLength(1)
  })

  it('closes event tracking immediately after a terminal status', () => {
    const wrapper = createWrapper()
    wrapper.vm.startStatusTracking()
    const client = eventClients[0]

    wrapper.vm.handleStatus({ uploadStatus: 'COMPLETED', fileStatus: 'READY', scanStatus: 'CLEAN' })

    expect(client.close).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('status-change')[0][1]).toMatchObject({ terminal: true, ready: true })
    expect(wrapper.vm.messageType).toBe('success')
    expect(wrapper.vm.message).toBe('扫描通过，文件已可用')
  })

  it('replaces the scanning success notice with the infected rejection from an event', async () => {
    const wrapper = createWrapper()
    wrapper.vm.message = '上传完成，文件正在安全扫描。'
    wrapper.vm.messageType = 'success'
    wrapper.vm.startStatusTracking()

    eventClients[0].options.events['file.upload.status.changed']({
      uploadStatus: 'FAILED', fileStatus: 'REJECTED', scanStatus: 'INFECTED',
    })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.file-uploader__message.error').text()).toBe('检测到病毒，文件已拒绝，不可使用')
    expect(wrapper.vm.statusText).toBe(wrapper.vm.message)
    expect(eventClients[0].close).toHaveBeenCalledTimes(1)
    expect(wrapper.emitted('status-change')[0][1]).toMatchObject({ terminal: true, ready: false, tone: 'error' })
    wrapper.destroy()
  })
})
