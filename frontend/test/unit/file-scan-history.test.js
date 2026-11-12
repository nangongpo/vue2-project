import { shallowMount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import FileScanHistory from '../../src/components/FileScanHistory.vue'
const api = vi.hoisted(() => ({ getFileScanJobs: vi.fn(), getFileScanJob: vi.fn(), getFileScanAttempts: vi.fn() }))
vi.mock('../../src/api/file-management', () => api)
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve() }
let wrapper
beforeEach(() => {
  vi.useFakeTimers(); Object.values(api).forEach((mock) => mock.mockReset())
  api.getFileScanJobs.mockResolvedValue({ items: [{ id: 'job', isTerminal: false, historyAvailable: true }], total: 1 })
  api.getFileScanJob.mockResolvedValue({ id: 'job', isTerminal: false, historyAvailable: true, triggers: [] })
  api.getFileScanAttempts.mockResolvedValue({ items: [], total: 0 })
})
afterEach(() => { wrapper?.destroy(); wrapper = null; vi.useRealTimers() })
function mount(props = {}) {
  wrapper = shallowMount(FileScanHistory, { propsData: { fileId: 'file', ...props }, directives: { loading: () => {} }, stubs: ['permission-button', 'el-table', 'el-table-column', 'el-tag', 'el-alert', 'el-pagination'] })
}
describe('file scan history UI lifecycle', () => {
  it('passes the approval filter and uses independent attempt pagination', async () => {
    mount({ approvalId: 'approval' }); await flush()
    expect(api.getFileScanJobs).toHaveBeenCalledWith('file', { page: 1, pageSize: 10, approvalId: 'approval' })
    await wrapper.vm.select({ id: 'job' }); wrapper.vm.changeAttemptPage(2); await flush()
    expect(api.getFileScanAttempts).toHaveBeenLastCalledWith('file', 'job', { page: 2, pageSize: 10 })
  })
  it('stops polling after destruction', async () => {
    mount(); await flush(); expect(vi.getTimerCount()).toBe(1)
    wrapper.destroy(); wrapper = null; await vi.advanceTimersByTimeAsync(10000)
    expect(api.getFileScanJobs).toHaveBeenCalledTimes(1)
  })
  it('stops polling when all tasks are terminal', async () => {
    api.getFileScanJobs.mockResolvedValue({ items: [{ id: 'job', isTerminal: true }], total: 1 })
    mount(); await flush(); expect(vi.getTimerCount()).toBe(0)
  })
  it('ignores a response from the previous file', async () => {
    let resolveOld
    api.getFileScanJobs.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve }))
    mount(); await wrapper.setProps({ fileId: 'other-file' }); await flush()
    resolveOld({ items: [{ id: 'old-file-job' }], total: 1 }); await flush()
    expect(wrapper.vm.jobs[0].id).toBe('job')
    expect(api.getFileScanJobs).toHaveBeenLastCalledWith('other-file', expect.anything())
  })
})
