import { SetMetadata } from '@nestjs/common'

export const FIELD_SECURITY_RESOURCE = 'field_security_resource'
export const FieldSecurity = (resource: 'button') => SetMetadata(FIELD_SECURITY_RESOURCE, resource)
