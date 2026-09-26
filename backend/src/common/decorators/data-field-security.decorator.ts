import { SetMetadata } from '@nestjs/common'

export const DATA_FIELD_SECURITY_RESOURCE = 'data_field_security_resource'
export const DataFieldSecurity = (resource: string) =>
  SetMetadata(DATA_FIELD_SECURITY_RESOURCE, resource)
