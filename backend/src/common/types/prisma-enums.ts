/**
 * Application-wide database enum boundary.
 *
 * Runtime enum values and their types remain owned by Prisma. Re-exporting
 * them here keeps module imports consistent and makes schema drift fail at
 * compile time instead of silently falling back to a different security model.
 */
export {
  AuditResult,
  DataScopeTargetType,
  ElevatedDataScopeType,
  FieldRiskLevel,
  OperationPolicyStatus,
  OpsEvidenceType,
  OpsExecutionResult,
  OpsRiskLevel,
  OpsTargetType,
  OpsTicketStatus,
  OpsTicketType,
  OrderStatus,
  PageNodeType,
  PermissionStatus,
  PermissionType,
  RiskLevel,
  RoleStatus,
  RoleType,
  SessionKind,
  StandardDataScopeType,
  UserStatus,
} from '@prisma/client'
