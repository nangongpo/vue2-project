import { SetMetadata } from '@nestjs/common'

export type DataFieldSecurityResource =
  | 'file'
  | 'file.upload'
  | 'system.api'
  | 'system.approval'
  | 'system.audit'
  | 'system.file.scan-job'
  | 'system.file.scan-attempt'
  | 'system.file.scan-trigger'
  | 'system.file'
  | 'system.file.audit'
  | 'system.health'
  | 'system.organization'
  | 'system.department'
  | 'system.ops-ticket'
  | 'system.role'
  | 'system.user'

export const DATA_FIELD_SECURITY_RESOURCE = 'data_field_security_resource'
export const DataFieldSecurity = (resource: DataFieldSecurityResource) =>
  SetMetadata(DATA_FIELD_SECURITY_RESOURCE, resource)
