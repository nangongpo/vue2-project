import { beforeEach, describe, expect, it, vi } from 'vitest'
import FileManagement from '@/views/system/file/index.vue'

const api = vi.hoisted(() => ({ deleteManagedFile: vi.fn(), getManagedFile: vi.fn(), getManagedFiles: vi.fn(),
  rejectManagedFile: vi.fn(), rescanManagedFile: vi.fn(), restoreManagedFile: vi.fn(),
  getFileScanJobs: vi.fn(), getFileScanJob: vi.fn(), getFileScanAttempts: vi.fn() }))
vi.mock('@/api/file-management', () => api)
beforeEach(() => vi.clearAllMocks())
function state() {
  return { ...FileManagement.data(), actionFile: { id: 'file' }, actionType: 'delete', actionReason: '删除原因', actionVisible: true,
    loadFiles: vi.fn(), $message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }
}
describe('file management execution feedback', () => {
  it.each(['EXECUTED', 'PENDING_APPROVAL'])('shows the server result for %s', async (status) => {
    const vm = state()
    api.deleteManagedFile.mockResolvedValue({ status, riskLevel: status === 'EXECUTED' ? 'L2' : 'L3' })
    await FileManagement.methods.submitAction.call(vm)
    expect(vm.$message.success).toHaveBeenCalledWith(status === 'EXECUTED' ? '操作已执行' : '已提交审批，请到授权审批页面继续处理')
    expect(vm.actionVisible).toBe(false)
    expect(vm.actionBusy).toBe(false)
  })
  it('requires an explicit security release reason and sends it with the rescan', async () => {
    const vm = { ...state(), actionType: 'rescan', releaseRequested: true }
    await FileManagement.methods.submitAction.call(vm)
    expect(api.rescanManagedFile).not.toHaveBeenCalled()
    vm.releaseReason = '调查确认误报'
    api.rescanManagedFile.mockResolvedValue({ status: 'PENDING_APPROVAL', riskLevel: 'L3' })
    await FileManagement.methods.submitAction.call(vm)
    expect(api.rescanManagedFile).toHaveBeenCalledWith('file', '删除原因', '调查确认误报')
  })
  it('keeps the dialog and reason available after a failed request', async () => {
    const vm = state()
    api.deleteManagedFile.mockRejectedValue(new Error('状态已变化'))
    await FileManagement.methods.submitAction.call(vm)
    expect(vm.actionVisible).toBe(true)
    expect(vm.actionReason).toBe('删除原因')
    expect(vm.actionBusy).toBe(false)
    expect(vm.$message.error).toHaveBeenCalledWith('状态已变化')
  })
})
