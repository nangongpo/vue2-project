import { describe, expect, it } from 'vitest'
import {
  API_BY_CODE,
  isManagementApiPath,
  isManagementResource,
  roleAllowsPermission,
} from '#app/security/policies/permission-catalog/index.js'
import { PAGE_PERMISSION_BINDINGS } from '#app/database/page-permission-bindings.js'
import { DATA_FIELD_DEFINITIONS } from '#app/security/policies/static-field-definitions.js'

describe('file module permission boundary', () => {
  it('keeps business file capabilities separate from system file administration', () => {
    const upload = API_BY_CODE.get('file.upload.initiate')
    const fileList = API_BY_CODE.get('file.upload.read')
    const resume = API_BY_CODE.get('file.upload.resume')
    const admin = API_BY_CODE.get('system.file.admin.read')

    expect(upload).toBeDefined()
    expect(fileList).toBeDefined()
    expect(resume).toBeDefined()
    expect(admin).toBeDefined()
    if (!upload || !admin) return
    expect(upload?.resource).toBe('file')
    expect(roleAllowsPermission('BUSINESS', upload)).toBe(true)
    expect(fileList?.path).toBe('/api/v1/files/uploads/mine')
    expect(resume?.path).toBe('/api/v1/files/uploads/unfinished')
    expect(roleAllowsPermission('BUSINESS', fileList as any)).toBe(true)
    expect(PAGE_PERMISSION_BINDINGS['page.business.file-upload']).toContainEqual({
      type: 'BUTTON_API',
      apiCode: 'file.upload.events',
      actionKey: 'events',
    })
    expect(admin?.resource).toBe('system.file')
    expect(roleAllowsPermission('BUSINESS', admin)).toBe(false)
    expect(isManagementResource(admin?.resource || '')).toBe(true)
    expect(isManagementApiPath('/api/v1/files')).toBe(false)
    expect([...API_BY_CODE.values()].some((entry) => entry.path?.includes('part-urls'))).toBe(false)
  })

  it('registers every field exposed by file.upload.read', () => {
    const exposedFields = [
      'id',
      'originalName',
      'safeName',
      'declaredMime',
      'detectedMime',
      'extension',
      'size',
      'status',
      'statusLabel',
      'scanStatus',
      'scanStatusLabel',
      'scanDetail',
      'createdAt',
      'updatedAt',
      'deletedAt',
    ]
    expect(DATA_FIELD_DEFINITIONS.filter((field) => field.resource === 'file').map((field) => field.field))
      .toEqual(exposedFields)
  })

  it('registers system file management fields and related resources', () => {
    const fields = (resource: string) =>
      DATA_FIELD_DEFINITIONS.filter((field) => field.resource === resource).map((field) => field.field)

    expect(fields('system.file')).toEqual(expect.arrayContaining([
      'id',
      'tenantId',
      'ownerUserId',
      'originalName',
      'sha256',
      'classification',
      'status',
      'scanStatus',
      'scanDetail',
      'owner',
      'bindings',
      'uploads',
      'scanResult',
    ]))
    expect(fields('system.file.binding')).toEqual(expect.arrayContaining(['id', 'fileId', 'resourceType', 'resourceId', 'visibility']))
    expect(fields('system.file.upload')).toEqual(expect.arrayContaining(['id', 'status', 'purpose', 'createdAt', 'updatedAt']))
    expect(fields('system.file.scan-result')).toEqual(['verdict', 'detail', 'engineVersion', 'policyVersion'])
  })
})
