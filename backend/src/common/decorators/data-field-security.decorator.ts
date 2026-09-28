import { SetMetadata } from '@nestjs/common'

export type DataFieldSecurityResource =
  | 'system.api'
  | 'system.approval'
  | 'system.audit'
  | 'system.health'
  | 'system.ops-ticket'
  | 'system.role'
  | 'system.user'

export const DATA_FIELD_SECURITY_RESOURCE = 'data_field_security_resource'
export const DataFieldSecurity = (resource: DataFieldSecurityResource) =>
  SetMetadata(DATA_FIELD_SECURITY_RESOURCE, resource)
