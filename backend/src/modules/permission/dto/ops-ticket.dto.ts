import { Type } from 'class-transformer'
import { IsBoolean, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'

const ticketTypes = ['MFA_RESET_EMERGENCY', 'DB_MANUAL_FIX', 'PERMISSION_RECOVERY', 'ACCOUNT_RECOVERY', 'OTHER'] as const
const statuses = ['DRAFT', 'SUBMITTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'REJECTED', 'CANCELLED'] as const
const risks = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
const targets = ['USER', 'ROLE', 'PERMISSION', 'DATABASE', 'SYSTEM', 'OTHER'] as const
const evidenceTypes = ['APPROVAL_SCREENSHOT', 'EMAIL', 'CHAT', 'SQL_REVIEW', 'OTHER'] as const

export type OpsTicketTypeValue = (typeof ticketTypes)[number]

export class CreateOpsTicketDto {
  /** 运维工单类型。 */
  @IsIn(ticketTypes) type!: OpsTicketTypeValue
  /** 风险等级。 */
  @IsIn(risks) riskLevel!: (typeof risks)[number]
  /** 工单标题。 */
  @IsString() @MinLength(1) @MaxLength(160) title!: string
  /** 工单申请原因。 */
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string
  /** 目标资源类型。 */
  @IsIn(targets) targetType!: (typeof targets)[number]
  /** 目标资源 ID。 */
  @IsOptional() @IsString() @MaxLength(128) targetId?: string
  /** 线下依据。 */
  @IsString() @MinLength(1) @MaxLength(1000) offlineBasis!: string
  /** 身份核验记录。 */
  @IsString() @MinLength(1) @MaxLength(500) identityVerification!: string
  /** 线下审批人。 */
  @IsString() @MinLength(1) @MaxLength(128) offlineApprover!: string
  /** 线下复核人。 */
  @IsString() @MinLength(1) @MaxLength(128) offlineReviewer!: string
  @IsOptional() @IsString() @MaxLength(128) externalRef?: string
}

export class PatchOpsTicketDto {
  @IsOptional() @IsIn(risks) riskLevel?: (typeof risks)[number]
  @IsOptional() @IsString() @MinLength(1) @MaxLength(160) title?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) reason?: string
  @IsOptional() @IsString() @MaxLength(128) targetId?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) offlineBasis?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(500) identityVerification?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) offlineApprover?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) offlineReviewer?: string
  @IsOptional() @IsString() @MaxLength(128) externalRef?: string
}

export class OpsTicketQueryDto {
  @IsOptional() @IsIn(statuses) status?: (typeof statuses)[number]
  @IsOptional() @IsIn(ticketTypes) type?: OpsTicketTypeValue
  @IsOptional() @IsIn(risks) riskLevel?: (typeof risks)[number]
  @Type(() => Number) @IsOptional() page = 1
  @Type(() => Number) @IsOptional() pageSize = 20
}

export class OpsNoteDto {
  @IsString() @MinLength(1) @MaxLength(1000) note!: string
}

export class OpsEvidenceDto {
  @IsIn(evidenceTypes) type!: (typeof evidenceTypes)[number]
  @IsString() @MinLength(1) @MaxLength(255) name!: string
  @IsString() @MinLength(1) @MaxLength(1024) uri!: string
  @IsOptional() @IsString() @MaxLength(64) sha256?: string
}

export class OpsExecutionDto {
  @IsString() @MinLength(1) @MaxLength(32) ticketNo!: string
  @IsOptional() @IsIn(ticketTypes) type?: OpsTicketTypeValue
  @IsString() @MinLength(1) @MaxLength(128) operatorOsUser!: string
  @IsString() @MinLength(1) @MaxLength(255) operatorHost!: string
  @IsString() @MinLength(1) @MaxLength(255) dbCurrentUser!: string
  @IsOptional() @IsString() @MaxLength(128) gitCommit?: string
  @IsString() @MinLength(1) @MaxLength(255) scriptName!: string
  @IsString() @MinLength(1) @MaxLength(128) scriptVersion!: string
  @IsString() @Matches(/^[a-f0-9]{64}$/i) commandHash!: string
  @IsBoolean() @IsOptional() dryRun = false
  @IsIn(['SUCCESS', 'FAILED']) result!: 'SUCCESS' | 'FAILED'
  @IsOptional() beforeSnapshot?: unknown
  @IsOptional() afterSnapshot?: unknown
  @IsString() @MinLength(1) @MaxLength(64) traceId!: string
  @IsISO8601() signedAt!: string
  @IsString() @Matches(/^[a-f0-9]{64}$/i) signature!: string
}
