import { plainToInstance } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  validateSync,
} from 'class-validator'
import { BadRequestException } from '@nestjs/common'

export const APPROVAL_KINDS = [
  'ROLE_GRANT',
  'ROLE_PERMISSIONS',
  'API_ROUTE_CHANGE',
  'ELEVATED_SCOPE',
  'ROLE_REVOKE',
  'ROLE_PERMISSION_REVOKE',
  'ELEVATED_REVOKE',
  'MFA_RESET',
] as const
export type ApprovalKindInput = (typeof APPROVAL_KINDS)[number]

export class CreateApprovalDto {
  @IsIn(APPROVAL_KINDS) kind!: ApprovalKindInput
  @IsString() @MinLength(1) @MaxLength(255) reason!: string
  @IsISO8601({ strict: true }) expiresAt!: string
  @IsObject() payload!: Record<string, unknown>
}
export class ApprovalActionDto {
  @IsString() @MinLength(1) @MaxLength(255) note!: string
}
export class ApprovalQueryDto {
  @IsOptional() @IsIn(['REQUESTED', 'APPROVED', 'EXECUTED', 'REVIEWED']) status?: 'REQUESTED' | 'APPROVED' | 'EXECUTED' | 'REVIEWED'
  @IsOptional() @IsUUID() cursor?: string
}
export class RoleGrantPayload {
  @IsUUID() userId!: string
  @IsUUID() roleId!: string
}
export class MfaResetPayload {
  @IsUUID() userId!: string
}
export class ElevatedRevokePayload {
  @IsUUID() scopeId!: string
}
export class RolePermissionsPayload {
  @IsUUID() roleId!: string
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  permissionIds!: string[]
}
export class ApiRouteChangePayload {
  @IsUUID() apiId!: string
  @IsString() @MinLength(2) @MaxLength(128) code!: string
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method!: string
  @IsString() @MaxLength(255) path!: string
}
export class ScopeTarget {
  @IsIn(['USER', 'DEPARTMENT', 'ORGANIZATION', 'TENANT']) targetType!: 'USER' | 'DEPARTMENT' | 'ORGANIZATION' | 'TENANT'
  @IsUUID() targetId!: string
}
export class ElevatedScopePayload {
  @IsUUID() roleId!: string
  @IsIn(['CUSTOM', 'ALL']) scopeType!: 'CUSTOM' | 'ALL'
  @IsString() @MinLength(1) @MaxLength(128) resource!: string
  @IsArray() @ArrayMaxSize(200) targets!: ScopeTarget[]
}

/** Also validate service callers and persisted JSON; DTO validation alone is not a trust boundary. */
export function approvalDto<T extends object>(type: new () => T, value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('审批参数必须为对象')
  const dto = plainToInstance(type, value)
  if (validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true }).length) {
    throw new BadRequestException('审批参数无效或包含未允许的字段')
  }
  return dto
}
export function approvalPayload(kind: ApprovalKindInput, payload: unknown) {
  switch (kind) {
    case 'ROLE_GRANT':
    case 'ROLE_REVOKE':
      return approvalDto(RoleGrantPayload, payload)
    case 'MFA_RESET':
      return approvalDto(MfaResetPayload, payload)
    case 'ROLE_PERMISSIONS':
    case 'ROLE_PERMISSION_REVOKE':
      return approvalDto(RolePermissionsPayload, payload)
    case 'ELEVATED_REVOKE':
      return approvalDto(ElevatedRevokePayload, payload)
    case 'API_ROUTE_CHANGE':
      return approvalDto(ApiRouteChangePayload, payload)
    case 'ELEVATED_SCOPE': {
      const data = approvalDto(ElevatedScopePayload, payload)
      data.targets = data.targets.map((target) => approvalDto(ScopeTarget, target))
      if (
        !/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(data.resource) ||
        (data.scopeType === 'CUSTOM' ? !data.targets.length : !!data.targets.length) ||
        new Set(data.targets.map((target) => `${target.targetType}:${target.targetId}`)).size !== data.targets.length
      ) {
        throw new BadRequestException('数据资源或目标集合无效；CUSTOM 必须有目标，ALL 必须为空目标集合')
      }
      return data
    }
    default:
      throw new BadRequestException('不支持的审批类型')
  }
}
