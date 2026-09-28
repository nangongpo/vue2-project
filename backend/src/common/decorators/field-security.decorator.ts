import { SetMetadata } from '@nestjs/common'

export type FieldSecurityResource = 'button'

export const FIELD_SECURITY_RESOURCE = 'field_security_resource'
export const FieldSecurity = (resource: FieldSecurityResource) => SetMetadata(FIELD_SECURITY_RESOURCE, resource)
