-- CreateTable
CREATE TABLE `sys_user` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` CHAR(36) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `passwordChangedAt` DATETIME(3) NULL,
    `displayName` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginIp` VARCHAR(64) NULL,
    `expiresAt` DATETIME(3) NULL,
    `mfaSecret` VARCHAR(512) NULL,
    `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    `mfaLastStep` BIGINT NULL,
    `tenantId` CHAR(36) NULL,
    `departmentId` CHAR(36) NULL,
    `organizationId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_user_userId_key`(`userId`),
    UNIQUE INDEX `sys_user_username_key`(`username`),
    INDEX `sys_user_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `biz_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `orderId` CHAR(36) NOT NULL,
    `orderNo` VARCHAR(40) NOT NULL,
    `tenantId` CHAR(36) NULL,
    `ownerId` CHAR(36) NOT NULL,
    `departmentId` CHAR(36) NULL,
    `organizationId` CHAR(36) NULL,
    `customerName` VARCHAR(128) NOT NULL,
    `totalAmount` DECIMAL(18, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `status` ENUM('DRAFT', 'CONFIRMED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `remark` VARCHAR(500) NULL,
    `createdBy` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `biz_order_orderId_key`(`orderId`),
    UNIQUE INDEX `biz_order_orderNo_key`(`orderNo`),
    INDEX `biz_order_tenantId_status_createdAt_idx`(`tenantId`, `status`, `createdAt`),
    INDEX `biz_order_ownerId_createdAt_idx`(`ownerId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_password_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` BIGINT UNSIGNED NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_password_history_userId_createdAt_id_idx`(`userId`, `createdAt`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `roleId` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `roleType` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL DEFAULT 'BUSINESS',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_role_roleId_key`(`roleId`),
    UNIQUE INDEX `sys_role_code_key`(`code`),
    INDEX `sys_role_roleType_status_idx`(`roleType`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `type` ENUM('PAGE', 'BUTTON', 'API', 'MANAGEMENT', 'FIELD') NOT NULL DEFAULT 'API',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `method` VARCHAR(16) NULL,
    `path` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sys_permission_code_key`(`code`),
    INDEX `sys_permission_resource_action_idx`(`resource`, `action`),
    INDEX `sys_permission_type_status_idx`(`type`, `status`),
    INDEX `sys_permission_status_idx`(`status`),
    UNIQUE INDEX `sys_permission_method_path_key`(`method`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission_role_type` (
    `permissionId` CHAR(36) NOT NULL,
    `roleType` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL,

    INDEX `sys_permission_role_type_roleType_permissionId_idx`(`roleType`, `permissionId`),
    PRIMARY KEY (`permissionId`, `roleType`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_data_resource` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_data_resource_code_key`(`code`),
    INDEX `sys_data_resource_status_code_idx`(`status`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission_field` (
    `id` CHAR(36) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `field` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `dataType` VARCHAR(32) NOT NULL,
    `relationResource` VARCHAR(128) NULL,
    `relationModel` VARCHAR(128) NULL,
    `relationField` VARCHAR(128) NULL,
    `riskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `readPermissionId` CHAR(36) NOT NULL,
    `writePermissionId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sys_permission_field_resource_status_idx`(`resource`, `status`),
    UNIQUE INDEX `sys_permission_field_resource_field_key`(`resource`, `field`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `route` VARCHAR(255) NOT NULL,
    `component` VARCHAR(255) NULL,
    `icon` VARCHAR(128) NULL,
    `routeProps` JSON NULL,
    `nodeType` ENUM('DIRECTORY', 'PAGE') NOT NULL DEFAULT 'PAGE',
    `parentId` CHAR(36) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `permissionId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_function_code_key`(`code`),
    UNIQUE INDEX `sys_function_route_key`(`route`),
    UNIQUE INDEX `sys_function_permissionId_key`(`permissionId`),
    INDEX `sys_function_parentId_sort_idx`(`parentId`, `sort`),
    INDEX `sys_function_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function_button` (
    `id` CHAR(36) NOT NULL,
    `functionId` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `permissionId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_function_button_code_key`(`code`),
    UNIQUE INDEX `sys_function_button_permissionId_key`(`permissionId`),
    INDEX `sys_function_button_functionId_sort_idx`(`functionId`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function_api` (
    `functionId` CHAR(36) NOT NULL,
    `apiId` CHAR(36) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`functionId`, `apiId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_button_api` (
    `buttonId` CHAR(36) NOT NULL,
    `apiId` CHAR(36) NOT NULL,

    PRIMARY KEY (`buttonId`, `apiId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user_role` (
    `userId` BIGINT UNSIGNED NOT NULL,
    `roleId` BIGINT UNSIGNED NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `grantedBy` CHAR(36) NULL,
    `revokedBy` CHAR(36) NULL,
    `grantReason` VARCHAR(255) NULL,
    `revokeReason` VARCHAR(255) NULL,
    `approvalRef` CHAR(36) NULL,

    INDEX `sys_user_role_roleId_revokedAt_expiresAt_idx`(`roleId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_permission` (
    `roleId` BIGINT UNSIGNED NOT NULL,
    `permissionId` CHAR(36) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `grantedBy` CHAR(36) NULL,
    `revokedBy` CHAR(36) NULL,
    `grantReason` VARCHAR(255) NULL,
    `revokeReason` VARCHAR(255) NULL,
    `approvalRef` CHAR(36) NULL,

    INDEX `sys_role_permission_permissionId_revokedAt_expiresAt_idx`(`permissionId`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_data_scope` (
    `id` CHAR(36) NOT NULL,
    `roleId` BIGINT UNSIGNED NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `scopeType` ENUM('SELF', 'DEPARTMENT_SELF', 'DEPARTMENT_TREE', 'ORGANIZATION_SELF', 'ORGANIZATION_TREE', 'TENANT') NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sys_role_data_scope_roleId_scopeType_revokedAt_expiresAt_idx`(`roleId`, `scopeType`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_elevated_data_scope` (
    `id` CHAR(36) NOT NULL,
    `roleId` BIGINT UNSIGNED NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `scopeType` ENUM('CUSTOM', 'ALL') NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `approvalRef` CHAR(36) NOT NULL,
    `validFrom` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sys_role_elevated_data_scope_roleId_scopeType_revokedAt_expi_idx`(`roleId`, `scopeType`, `revokedAt`, `expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_elevated_data_scope_target` (
    `id` CHAR(36) NOT NULL,
    `elevatedScopeId` CHAR(36) NOT NULL,
    `targetType` ENUM('USER', 'DEPARTMENT', 'ORGANIZATION', 'TENANT') NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `targetUserId` CHAR(36) NULL,
    `targetDepartmentId` CHAR(36) NULL,
    `targetOrganizationId` CHAR(36) NULL,
    `targetTenantId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_role_elevated_data_scope_target_targetType_targetId_idx`(`targetType`, `targetId`),
    UNIQUE INDEX `sys_role_elevated_data_scope_target_elevatedScopeId_targetTy_key`(`elevatedScopeId`, `targetType`, `targetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_session` (
    `id` CHAR(64) NOT NULL,
    `userId` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('PRE_AUTH', 'AUTHENTICATED') NOT NULL DEFAULT 'AUTHENTICATED',
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
    `mfaVerifiedAt` DATETIME(3) NULL,
    `reauthenticatedAt` DATETIME(3) NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,

    INDEX `sys_session_userId_revokedAt_idx`(`userId`, `revokedAt`),
    INDEX `sys_session_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_audit_log` (
    `id` CHAR(36) NOT NULL,
    `traceId` VARCHAR(64) NOT NULL,
    `actorId` BIGINT UNSIGNED NULL,
    `action` VARCHAR(128) NOT NULL,
    `operationCode` VARCHAR(128) NULL,
    `riskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L0',
    `resource` VARCHAR(128) NOT NULL,
    `method` VARCHAR(16) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `result` ENUM('SUCCESS', 'FAILURE') NOT NULL,
    `statusCode` INTEGER NOT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `detail` JSON NULL,
    `integrityHash` CHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_audit_log_createdAt_idx`(`createdAt`),
    INDEX `sys_audit_log_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `sys_audit_log_traceId_idx`(`traceId`),
    INDEX `sys_audit_log_riskLevel_createdAt_idx`(`riskLevel`, `createdAt`),
    INDEX `sys_audit_log_operationCode_createdAt_idx`(`operationCode`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_operation_policy` (
    `id` CHAR(36) NOT NULL,
    `operationCode` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `riskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
    `minimumRiskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
    `requireMfa` BOOLEAN NOT NULL DEFAULT false,
    `requireReauth` BOOLEAN NOT NULL DEFAULT false,
    `requireApproval` BOOLEAN NOT NULL DEFAULT false,
    `requireDualControl` BOOLEAN NOT NULL DEFAULT false,
    `auditRequired` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('DRAFT', 'PENDING', 'ACTIVE', 'DISABLED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `reason` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_operation_policy_operationCode_key`(`operationCode`),
    INDEX `sys_operation_policy_status_riskLevel_idx`(`status`, `riskLevel`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_ops_ticket` (
    `id` CHAR(36) NOT NULL,
    `ticketNo` VARCHAR(32) NOT NULL,
    `type` ENUM('MFA_RESET_EMERGENCY', 'DB_MANUAL_FIX', 'PERMISSION_RECOVERY', 'ACCOUNT_RECOVERY', 'OTHER') NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `riskLevel` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `targetType` ENUM('USER', 'ROLE', 'PERMISSION', 'DATABASE', 'SYSTEM', 'OTHER') NOT NULL,
    `targetId` VARCHAR(128) NULL,
    `offlineBasis` VARCHAR(1000) NOT NULL,
    `identityVerification` VARCHAR(500) NOT NULL,
    `offlineApprover` VARCHAR(128) NOT NULL,
    `offlineReviewer` VARCHAR(128) NOT NULL,
    `externalRef` VARCHAR(128) NULL,
    `requestedBy` CHAR(36) NOT NULL,
    `approvedBy` CHAR(36) NULL,
    `executedBy` CHAR(36) NULL,
    `reviewedBy` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `approvedAt` DATETIME(3) NULL,
    `executedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `closedAt` DATETIME(3) NULL,

    UNIQUE INDEX `sys_ops_ticket_ticketNo_key`(`ticketNo`),
    INDEX `sys_ops_ticket_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `sys_ops_ticket_type_riskLevel_createdAt_idx`(`type`, `riskLevel`, `createdAt`),
    INDEX `sys_ops_ticket_requestedBy_createdAt_idx`(`requestedBy`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_ops_ticket_evidence` (
    `id` CHAR(36) NOT NULL,
    `ticketId` CHAR(36) NOT NULL,
    `type` ENUM('APPROVAL_SCREENSHOT', 'EMAIL', 'CHAT', 'SQL_REVIEW', 'OTHER') NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `uri` VARCHAR(1024) NOT NULL,
    `sha256` CHAR(64) NULL,
    `uploadedBy` CHAR(36) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_ops_ticket_evidence_ticketId_createdAt_idx`(`ticketId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_ops_ticket_execution` (
    `id` CHAR(36) NOT NULL,
    `ticketId` CHAR(36) NOT NULL,
    `ticketNo` VARCHAR(32) NOT NULL,
    `executorUserId` CHAR(36) NULL,
    `operatorOsUser` VARCHAR(128) NOT NULL,
    `operatorHost` VARCHAR(255) NOT NULL,
    `operatorIp` VARCHAR(64) NULL,
    `dbCurrentUser` VARCHAR(255) NOT NULL,
    `gitCommit` VARCHAR(128) NULL,
    `scriptName` VARCHAR(255) NOT NULL,
    `scriptVersion` VARCHAR(128) NOT NULL,
    `commandHash` CHAR(64) NOT NULL,
    `dryRun` BOOLEAN NOT NULL DEFAULT false,
    `result` ENUM('SUCCESS', 'FAILED') NOT NULL,
    `beforeSnapshot` JSON NULL,
    `afterSnapshot` JSON NULL,
    `traceId` VARCHAR(64) NOT NULL,
    `signedAt` DATETIME(3) NULL,
    `executionSignature` CHAR(64) NULL,
    `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_ops_ticket_execution_ticketId_executedAt_idx`(`ticketId`, `executedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_tenant` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_tenant_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_organization` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sys_organization_parentId_tenantId_idx`(`parentId`, `tenantId`),
    UNIQUE INDEX `sys_organization_id_tenantId_key`(`id`, `tenantId`),
    UNIQUE INDEX `sys_organization_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_department` (
    `id` CHAR(36) NOT NULL,
    `tenantId` CHAR(36) NOT NULL,
    `organizationId` CHAR(36) NOT NULL,
    `parentId` CHAR(36) NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `sys_department_parentId_tenantId_organizationId_idx`(`parentId`, `tenantId`, `organizationId`),
    INDEX `sys_department_organizationId_tenantId_idx`(`organizationId`, `tenantId`),
    UNIQUE INDEX `sys_department_id_tenantId_key`(`id`, `tenantId`),
    UNIQUE INDEX `sys_department_id_tenantId_organizationId_key`(`id`, `tenantId`, `organizationId`),
    UNIQUE INDEX `sys_department_tenantId_code_key`(`tenantId`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_approval_request` (
    `id` CHAR(36) NOT NULL,
    `requestNo` VARCHAR(20) NOT NULL,
    `kind` ENUM('ROLE_GRANT', 'ROLE_STATUS', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `payload` JSON NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `applicantId` CHAR(36) NOT NULL,
    `applicantDisplayName` VARCHAR(128) NULL,
    `approverId` CHAR(36) NULL,
    `approverDisplayName` VARCHAR(128) NULL,
    `executorId` CHAR(36) NULL,
    `executorDisplayName` VARCHAR(128) NULL,
    `reviewerId` CHAR(36) NULL,
    `reviewerDisplayName` VARCHAR(128) NULL,
    `approvedAt` DATETIME(3) NULL,
    `executedAt` DATETIME(3) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `approvalNote` VARCHAR(255) NULL,
    `executionNote` VARCHAR(255) NULL,
    `reviewNote` VARCHAR(255) NULL,
    `cancelledAt` DATETIME(3) NULL,
    `cancellerId` CHAR(36) NULL,
    `cancellerDisplayName` VARCHAR(128) NULL,
    `cancellationNote` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_approval_request_requestNo_key`(`requestNo`),
    INDEX `sys_approval_request_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `sys_approval_request_applicantId_createdAt_idx`(`applicantId`, `createdAt`),
    INDEX `sys_approval_request_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_approval_target_ref` (
    `id` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `actorUserId` CHAR(36) NOT NULL,
    `kind` ENUM('ROLE_GRANT', 'ROLE_STATUS', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL,
    `targetType` VARCHAR(16) NOT NULL,
    `targetId` CHAR(36) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sys_approval_target_ref_tokenHash_key`(`tokenHash`),
    INDEX `sys_approval_target_ref_actorUserId_expiresAt_idx`(`actorUserId`, `expiresAt`),
    INDEX `sys_approval_target_ref_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_organizationId_tenantId_fkey` FOREIGN KEY (`organizationId`, `tenantId`) REFERENCES `sys_organization`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_departmentId_tenantId_organizationId_fkey` FOREIGN KEY (`departmentId`, `tenantId`, `organizationId`) REFERENCES `sys_department`(`id`, `tenantId`, `organizationId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `biz_order` ADD CONSTRAINT `biz_order_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `biz_order` ADD CONSTRAINT `biz_order_ownerId_fkey` FOREIGN KEY (`ownerId`) REFERENCES `sys_user`(`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_password_history` ADD CONSTRAINT `sys_password_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_permission_role_type` ADD CONSTRAINT `sys_permission_role_type_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_permission_field` ADD CONSTRAINT `sys_permission_field_readPermissionId_fkey` FOREIGN KEY (`readPermissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_permission_field` ADD CONSTRAINT `sys_permission_field_writePermissionId_fkey` FOREIGN KEY (`writePermissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function` ADD CONSTRAINT `sys_function_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `sys_function`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_function` ADD CONSTRAINT `sys_function_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_button` ADD CONSTRAINT `sys_function_button_functionId_fkey` FOREIGN KEY (`functionId`) REFERENCES `sys_function`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_button` ADD CONSTRAINT `sys_function_button_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_api` ADD CONSTRAINT `sys_function_api_functionId_fkey` FOREIGN KEY (`functionId`) REFERENCES `sys_function`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_api` ADD CONSTRAINT `sys_function_api_apiId_fkey` FOREIGN KEY (`apiId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_button_api` ADD CONSTRAINT `sys_button_api_buttonId_fkey` FOREIGN KEY (`buttonId`) REFERENCES `sys_function_button`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_button_api` ADD CONSTRAINT `sys_button_api_apiId_fkey` FOREIGN KEY (`apiId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_data_scope` ADD CONSTRAINT `sys_role_data_scope_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_data_scope` ADD CONSTRAINT `sys_role_data_scope_resource_fkey` FOREIGN KEY (`resource`) REFERENCES `sys_data_resource`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope` ADD CONSTRAINT `sys_role_elevated_data_scope_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope` ADD CONSTRAINT `sys_role_elevated_data_scope_resource_fkey` FOREIGN KEY (`resource`) REFERENCES `sys_data_resource`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_targetUserId_fkey` FOREIGN KEY (`targetUserId`) REFERENCES `sys_user`(`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_targetDepartmentId_fkey` FOREIGN KEY (`targetDepartmentId`) REFERENCES `sys_department`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_targetOrganizationId_fkey` FOREIGN KEY (`targetOrganizationId`) REFERENCES `sys_organization`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_targetTenantId_fkey` FOREIGN KEY (`targetTenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_elevatedScopeId_fkey` FOREIGN KEY (`elevatedScopeId`) REFERENCES `sys_role_elevated_data_scope`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_session` ADD CONSTRAINT `sys_session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_audit_log` ADD CONSTRAINT `sys_audit_log_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_ops_ticket_evidence` ADD CONSTRAINT `sys_ops_ticket_evidence_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `sys_ops_ticket`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_ops_ticket_execution` ADD CONSTRAINT `sys_ops_ticket_execution_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `sys_ops_ticket`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_organization` ADD CONSTRAINT `sys_organization_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_organization` ADD CONSTRAINT `sys_organization_parentId_tenantId_fkey` FOREIGN KEY (`parentId`, `tenantId`) REFERENCES `sys_organization`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_organizationId_tenantId_fkey` FOREIGN KEY (`organizationId`, `tenantId`) REFERENCES `sys_organization`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_parentId_tenantId_organizationId_fkey` FOREIGN KEY (`parentId`, `tenantId`, `organizationId`) REFERENCES `sys_department`(`id`, `tenantId`, `organizationId`) ON DELETE RESTRICT ON UPDATE CASCADE;
