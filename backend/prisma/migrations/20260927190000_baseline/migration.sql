-- Squashed baseline migration. Generated from the ordered migration history; safe for fresh databases.
-- Existing databases must mark this migration applied after verifying the schema.

-- >>> backend/prisma/migrations/20260923010000_init/migration.sql

-- ===== BEGIN backend/prisma/migrations/20260923010000_init/migration.sql =====
-- CreateTable
CREATE TABLE `sys_user` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `userId` CHAR(36) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `passwordHash` VARCHAR(255) NOT NULL,
    `displayName` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `failedLogins` INTEGER NOT NULL DEFAULT 0,
    `lockedUntil` DATETIME(3) NULL,
    `lastLoginAt` DATETIME(3) NULL,
    `lastLoginIp` VARCHAR(64) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_user_userId_key`(`userId`),
    UNIQUE INDEX `sys_user_username_key`(`username`),
    INDEX `sys_user_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `roleId` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_role_roleId_key`(`roleId`),
    UNIQUE INDEX `sys_role_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `type` ENUM('PAGE', 'BUTTON', 'API') NOT NULL DEFAULT 'API',
    `method` VARCHAR(16) NULL,
    `path` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sys_permission_code_key`(`code`),
    INDEX `sys_permission_resource_action_idx`(`resource`, `action`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `route` VARCHAR(255) NOT NULL,
    `component` VARCHAR(255) NULL,
    `parentId` CHAR(36) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `permissionId` CHAR(36) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_function_code_key`(`code`),
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
    `status` ENUM('ACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
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

    PRIMARY KEY (`userId`, `roleId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_permission` (
    `roleId` BIGINT UNSIGNED NOT NULL,
    `permissionId` CHAR(36) NOT NULL,
    `assignedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`roleId`, `permissionId`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_session` (
    `id` CHAR(64) NOT NULL,
    `userId` BIGINT UNSIGNED NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,
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
    `resource` VARCHAR(128) NOT NULL,
    `method` VARCHAR(16) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `result` ENUM('SUCCESS', 'FAILURE') NOT NULL,
    `statusCode` INTEGER NOT NULL,
    `ip` VARCHAR(64) NULL,
    `userAgent` VARCHAR(512) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_audit_log_createdAt_idx`(`createdAt`),
    INDEX `sys_audit_log_actorId_createdAt_idx`(`actorId`, `createdAt`),
    INDEX `sys_audit_log_traceId_idx`(`traceId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_function` ADD CONSTRAINT `sys_function_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `sys_function`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function` ADD CONSTRAINT `sys_function_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_button` ADD CONSTRAINT `sys_function_button_functionId_fkey` FOREIGN KEY (`functionId`) REFERENCES `sys_function`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_button` ADD CONSTRAINT `sys_function_button_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_api` ADD CONSTRAINT `sys_function_api_functionId_fkey` FOREIGN KEY (`functionId`) REFERENCES `sys_function`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_api` ADD CONSTRAINT `sys_function_api_apiId_fkey` FOREIGN KEY (`apiId`) REFERENCES `sys_permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_button_api` ADD CONSTRAINT `sys_button_api_buttonId_fkey` FOREIGN KEY (`buttonId`) REFERENCES `sys_function_button`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_button_api` ADD CONSTRAINT `sys_button_api_apiId_fkey` FOREIGN KEY (`apiId`) REFERENCES `sys_permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_session` ADD CONSTRAINT `sys_session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_audit_log` ADD CONSTRAINT `sys_audit_log_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;


-- ===== BEGIN backend/prisma/migrations/20260923020000_permission_security/migration.sql =====
-- DropForeignKey
ALTER TABLE `sys_function` DROP FOREIGN KEY `sys_function_parentId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_function` DROP FOREIGN KEY `sys_function_permissionId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_function_button` DROP FOREIGN KEY `sys_function_button_functionId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_function_button` DROP FOREIGN KEY `sys_function_button_permissionId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_function_api` DROP FOREIGN KEY `sys_function_api_functionId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_function_api` DROP FOREIGN KEY `sys_function_api_apiId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_button_api` DROP FOREIGN KEY `sys_button_api_buttonId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_button_api` DROP FOREIGN KEY `sys_button_api_apiId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_user_role` DROP FOREIGN KEY `sys_user_role_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_role_permission` DROP FOREIGN KEY `sys_role_permission_roleId_fkey`;

-- DropForeignKey
ALTER TABLE `sys_role_permission` DROP FOREIGN KEY `sys_role_permission_permissionId_fkey`;

-- AlterTable
ALTER TABLE `sys_user` ADD COLUMN `departmentId` CHAR(36) NULL,
    ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `mfaEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `mfaLastStep` BIGINT NULL,
    ADD COLUMN `mfaSecret` VARCHAR(512) NULL,
    ADD COLUMN `organizationId` CHAR(36) NULL,
    ADD COLUMN `passwordChangedAt` DATETIME(3) NULL,
    ADD COLUMN `tenantId` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `sys_role` ADD COLUMN `roleType` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL DEFAULT 'BUSINESS';

-- AlterTable
ALTER TABLE `sys_permission` ADD COLUMN `requiredRoleType` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL DEFAULT 'BUSINESS',
    ADD COLUMN `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    MODIFY `type` ENUM('PAGE', 'BUTTON', 'API', 'MANAGEMENT') NOT NULL DEFAULT 'API';

-- Legacy LOCKED resource states mean DISABLED.
UPDATE `sys_function` SET `status` = 'DISABLED' WHERE `status` = 'LOCKED';
UPDATE `sys_function_button` SET `status` = 'DISABLED' WHERE `status` = 'LOCKED';

-- AlterTable
ALTER TABLE `sys_function` MODIFY `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `sys_function_button` MODIFY `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE `sys_user_role` ADD COLUMN `approvalRef` CHAR(36) NULL,
    ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `grantReason` VARCHAR(255) NULL,
    ADD COLUMN `grantedBy` CHAR(36) NULL,
    ADD COLUMN `revokeReason` VARCHAR(255) NULL,
    ADD COLUMN `revokedAt` DATETIME(3) NULL,
    ADD COLUMN `revokedBy` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `sys_role_permission` ADD COLUMN `approvalRef` CHAR(36) NULL,
    ADD COLUMN `expiresAt` DATETIME(3) NULL,
    ADD COLUMN `grantReason` VARCHAR(255) NULL,
    ADD COLUMN `grantedBy` CHAR(36) NULL,
    ADD COLUMN `revokeReason` VARCHAR(255) NULL,
    ADD COLUMN `revokedAt` DATETIME(3) NULL,
    ADD COLUMN `revokedBy` CHAR(36) NULL;

-- AlterTable
ALTER TABLE `sys_session` ADD COLUMN `mfaVerifiedAt` DATETIME(3) NULL,
    ADD COLUMN `reauthenticatedAt` DATETIME(3) NULL;

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
    `kind` ENUM('ROLE_GRANT', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE') NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `payload` JSON NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `applicantId` CHAR(36) NOT NULL,
    `approverId` CHAR(36) NULL,
    `executorId` CHAR(36) NULL,
    `reviewerId` CHAR(36) NULL,
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

    INDEX `sys_approval_request_status_createdAt_idx`(`status`, `createdAt`),
    INDEX `sys_approval_request_applicantId_createdAt_idx`(`applicantId`, `createdAt`),
    INDEX `sys_approval_request_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `sys_role_roleType_status_idx` ON `sys_role`(`roleType`, `status`);

-- CreateIndex
CREATE INDEX `sys_permission_type_status_idx` ON `sys_permission`(`type`, `status`);

-- CreateIndex
CREATE INDEX `sys_permission_status_idx` ON `sys_permission`(`status`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_permission_method_path_key` ON `sys_permission`(`method`, `path`);

-- CreateIndex
CREATE UNIQUE INDEX `sys_function_route_key` ON `sys_function`(`route`);

-- CreateIndex
CREATE INDEX `sys_user_role_roleId_revokedAt_expiresAt_idx` ON `sys_user_role`(`roleId`, `revokedAt`, `expiresAt`);

-- CreateIndex
CREATE INDEX `sys_role_permission_permissionId_revokedAt_expiresAt_idx` ON `sys_role_permission`(`permissionId`, `revokedAt`, `expiresAt`);

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_organizationId_tenantId_fkey` FOREIGN KEY (`organizationId`, `tenantId`) REFERENCES `sys_organization`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_departmentId_tenantId_organizationId_fkey` FOREIGN KEY (`departmentId`, `tenantId`, `organizationId`) REFERENCES `sys_department`(`id`, `tenantId`, `organizationId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_password_history` ADD CONSTRAINT `sys_password_history_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_permissionId_fkey` FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_data_scope` ADD CONSTRAINT `sys_role_data_scope_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope` ADD CONSTRAINT `sys_role_elevated_data_scope_roleId_fkey` FOREIGN KEY (`roleId`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

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
ALTER TABLE `sys_organization` ADD CONSTRAINT `sys_organization_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_organization` ADD CONSTRAINT `sys_organization_parentId_tenantId_fkey` FOREIGN KEY (`parentId`, `tenantId`) REFERENCES `sys_organization`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_organizationId_tenantId_fkey` FOREIGN KEY (`organizationId`, `tenantId`) REFERENCES `sys_organization`(`id`, `tenantId`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_parentId_tenantId_organizationId_fkey` FOREIGN KEY (`parentId`, `tenantId`, `organizationId`) REFERENCES `sys_department`(`id`, `tenantId`, `organizationId`) ON DELETE RESTRICT ON UPDATE CASCADE;


-- Deliberate fail-closed cutover; review and re-grant legacy assignments after migration.
UPDATE `sys_session` SET `revokedAt` = CURRENT_TIMESTAMP(3) WHERE `revokedAt` IS NULL;
UPDATE `sys_user_role` SET `revokedAt` = CURRENT_TIMESTAMP(3), `revokeReason` = 'permission-v2 migration: requires review' WHERE `revokedAt` IS NULL;
UPDATE `sys_role_permission` SET `revokedAt` = CURRENT_TIMESTAMP(3), `revokeReason` = 'permission-v2 migration: requires review' WHERE `revokedAt` IS NULL;
UPDATE `sys_permission` SET `status` = 'DISABLED', `type` = 'MANAGEMENT', `method` = NULL, `path` = NULL WHERE `code` IN ('*', 'system.permission.manage');
UPDATE `sys_permission` SET `code` = 'system.user.read', `action` = 'read', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'user:read';
UPDATE `sys_permission` SET `code` = 'system.user.create', `action` = 'create', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'user:create';
UPDATE `sys_permission` SET `code` = 'system.user.update', `action` = 'update', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'user:update';
UPDATE `sys_permission` SET `code` = 'system.user.reset-password', `action` = 'reset-password', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'user:reset-password';
UPDATE `sys_permission` SET `code` = 'system.role.read', `action` = 'read', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'role:read';
UPDATE `sys_permission` SET `code` = 'system.role.create', `action` = 'create', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'role:create';
UPDATE `sys_permission` SET `code` = 'system.role.update', `action` = 'update', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'role:update';
UPDATE `sys_permission` SET `code` = 'system.role.delete', `action` = 'delete', `requiredRoleType` = 'SECURITY', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'role:delete';
UPDATE `sys_permission` SET `code` = 'system.audit.read', `action` = 'read', `requiredRoleType` = 'AUDIT', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'audit:read';
UPDATE `sys_permission` SET `code` = 'system.audit.detail', `action` = 'detail', `requiredRoleType` = 'AUDIT', `path` = REPLACE(REPLACE(`path`, ':userId', ':id'), ':roleId', ':id') WHERE `code` = 'audit:detail';

-- Archive legacy write-to-page associations as audit evidence before removing invalid edges.
INSERT INTO `sys_audit_log` (`id`,`traceId`,`action`,`resource`,`method`,`path`,`result`,`statusCode`,`detail`,`createdAt`)
SELECT UUID(), UUID(), 'permission.migrate-page-api', 'permission', 'MIGRATE', '/migration/permission-v2', 'SUCCESS', 200, JSON_OBJECT('functionId', f.`functionId`, 'apiId', f.`apiId`, 'reason', 'write APIs must be bound to explicit buttons'), CURRENT_TIMESTAMP(3) FROM `sys_function_api` f JOIN `sys_permission` p ON p.`id`=f.`apiId` WHERE p.`method` <> 'GET' OR p.`method` IS NULL;
DELETE f FROM `sys_function_api` f JOIN `sys_permission` p ON p.`id`=f.`apiId` WHERE p.`method` <> 'GET' OR p.`method` IS NULL;

-- MySQL >= 8.0.16; constraints complement transactional service validation.
ALTER TABLE sys_role_elevated_data_scope ADD CONSTRAINT elevated_scope_expiry CHECK (expiresAt > validFrom AND CHAR_LENGTH(TRIM(reason)) > 0);
ALTER TABLE sys_role_data_scope ADD CONSTRAINT standard_scope_expiry CHECK (expiresAt IS NULL OR expiresAt > createdAt);
ALTER TABLE sys_approval_request ADD CONSTRAINT approval_expiry CHECK (expiresAt > createdAt), ADD CONSTRAINT approval_separation CHECK ((approverId IS NULL OR approverId <> applicantId) AND (reviewerId IS NULL OR (reviewerId <> applicantId AND reviewerId <> approverId AND reviewerId <> executorId)));
ALTER TABLE sys_user ADD CONSTRAINT user_org_tenant CHECK ((organizationId IS NULL OR tenantId IS NOT NULL) AND (departmentId IS NULL OR (tenantId IS NOT NULL AND organizationId IS NOT NULL)));
ALTER TABLE sys_function ADD CONSTRAINT page_not_own_parent CHECK (parentId IS NULL OR parentId <> id);
ALTER TABLE sys_permission ADD CONSTRAINT explicit_api_method CHECK (type <> 'API' OR status = 'DISABLED' OR (method IS NOT NULL AND method IN ('GET','POST','PUT','PATCH','DELETE') AND path IS NOT NULL));
-- Runtime application users must not have ALTER/DROP/TRIGGER privileges.
CREATE TRIGGER sys_audit_log_no_update BEFORE UPDATE ON sys_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit records are append-only';
CREATE TRIGGER sys_audit_log_no_delete BEFORE DELETE ON sys_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Audit retention requires controlled archival';

ALTER TABLE sys_role_elevated_data_scope_target ADD CONSTRAINT exactly_one_typed_target CHECK (
  (targetType='USER' AND targetUserId IS NOT NULL AND targetUserId=targetId AND targetDepartmentId IS NULL AND targetOrganizationId IS NULL AND targetTenantId IS NULL) OR
  (targetType='DEPARTMENT' AND targetDepartmentId IS NOT NULL AND targetDepartmentId=targetId AND targetUserId IS NULL AND targetOrganizationId IS NULL AND targetTenantId IS NULL) OR
  (targetType='ORGANIZATION' AND targetOrganizationId IS NOT NULL AND targetOrganizationId=targetId AND targetUserId IS NULL AND targetDepartmentId IS NULL AND targetTenantId IS NULL) OR
  (targetType='TENANT' AND targetTenantId IS NOT NULL AND targetTenantId=targetId AND targetUserId IS NULL AND targetDepartmentId IS NULL AND targetOrganizationId IS NULL)
);

-- ===== BEGIN backend/prisma/migrations/20260923030000_mfa_reset_approval/migration.sql =====
-- Extend controlled approval workflows to cover administrator MFA loss recovery.
ALTER TABLE `sys_approval_request` MODIFY `kind` ENUM('ROLE_GRANT', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL;

-- ===== BEGIN backend/prisma/migrations/20260923040000_ops_tickets/migration.sql =====
CREATE TABLE `sys_ops_ticket` (
  `id` CHAR(36) NOT NULL,
  `ticketNo` VARCHAR(32) NOT NULL,
  `type` ENUM('MFA_RESET_EMERGENCY','DB_MANUAL_FIX','PERMISSION_RECOVERY','ACCOUNT_RECOVERY','OTHER') NOT NULL,
  `status` ENUM('DRAFT','SUBMITTED','APPROVED','EXECUTED','REVIEWED','REJECTED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
  `riskLevel` ENUM('LOW','MEDIUM','HIGH','CRITICAL') NOT NULL,
  `title` VARCHAR(160) NOT NULL,
  `reason` VARCHAR(1000) NOT NULL,
  `targetType` ENUM('USER','ROLE','PERMISSION','DATABASE','SYSTEM','OTHER') NOT NULL,
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
  UNIQUE INDEX `sys_ops_ticket_ticketNo_key` (`ticketNo`),
  INDEX `sys_ops_ticket_status_createdAt_idx` (`status`,`createdAt`),
  INDEX `sys_ops_ticket_type_riskLevel_createdAt_idx` (`type`,`riskLevel`,`createdAt`),
  INDEX `sys_ops_ticket_requestedBy_createdAt_idx` (`requestedBy`,`createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sys_ops_ticket_evidence` (
  `id` CHAR(36) NOT NULL,
  `ticketId` CHAR(36) NOT NULL,
  `type` ENUM('APPROVAL_SCREENSHOT','EMAIL','CHAT','SQL_REVIEW','OTHER') NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `uri` VARCHAR(1024) NOT NULL,
  `sha256` CHAR(64) NULL,
  `uploadedBy` CHAR(36) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `sys_ops_ticket_evidence_ticketId_createdAt_idx` (`ticketId`,`createdAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sys_ops_ticket_evidence_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `sys_ops_ticket` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

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
  `result` ENUM('SUCCESS','FAILED') NOT NULL,
  `beforeSnapshot` JSON NULL,
  `afterSnapshot` JSON NULL,
  `traceId` VARCHAR(64) NOT NULL,
  `executedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `sys_ops_ticket_execution_ticketId_executedAt_idx` (`ticketId`,`executedAt`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sys_ops_ticket_execution_ticketId_fkey` FOREIGN KEY (`ticketId`) REFERENCES `sys_ops_ticket` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ===== BEGIN backend/prisma/migrations/20260923050000_signed_ops_execution/migration.sql =====
-- Preserve the signed execution envelope for later audit verification.
ALTER TABLE `sys_ops_ticket_execution`
  ADD COLUMN `signedAt` DATETIME(3) NULL,
  ADD COLUMN `executionSignature` CHAR(64) NULL;

-- ===== BEGIN backend/prisma/migrations/20260923060000_audit_integrity_controls/migration.sql =====
-- Existing rows remain nullable; all new application writes include an integrity hash.
ALTER TABLE `sys_audit_log`
  ADD COLUMN `integrityHash` CHAR(64) NULL;

-- Audit history is append-only for the application database user.
DROP TRIGGER IF EXISTS `sys_audit_log_no_update`;
DROP TRIGGER IF EXISTS `sys_audit_log_no_delete`;

CREATE TRIGGER `sys_audit_log_no_update`
BEFORE UPDATE ON `sys_audit_log`
FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit logs are append-only';

CREATE TRIGGER `sys_audit_log_no_delete`
BEFORE DELETE ON `sys_audit_log`
FOR EACH ROW
  SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit logs are append-only';

-- ===== BEGIN backend/prisma/migrations/20260923070000_mfa_state_check/migration.sql =====
-- Keep the MFA state and encrypted secret consistent at the database boundary.
ALTER TABLE `sys_user`
  ADD CONSTRAINT `sys_user_mfa_state_check`
  CHECK (
    (`mfaEnabled` = 0 AND `mfaSecret` IS NULL)
    OR (`mfaEnabled` = 1 AND `mfaSecret` IS NOT NULL AND CHAR_LENGTH(`mfaSecret`) > 0)
  );

-- ===== BEGIN backend/prisma/migrations/20260923080000_mfa_disable_clears_secret/migration.sql =====
-- Enforce cleanup even when a caller updates sys_user outside the MFA service.
DROP TRIGGER IF EXISTS `sys_user_mfa_disable_clears_secret`;

CREATE TRIGGER `sys_user_mfa_disable_clears_secret`
BEFORE UPDATE ON `sys_user`
FOR EACH ROW
SET
  NEW.`mfaSecret` = IF(NEW.`mfaEnabled` = 0, NULL, NEW.`mfaSecret`),
  NEW.`mfaLastStep` = IF(NEW.`mfaEnabled` = 0, NULL, NEW.`mfaLastStep`);

-- ===== BEGIN consolidated follow-up migrations =====
-- Existing sessions are formal sessions. New login attempts explicitly use PRE_AUTH.
ALTER TABLE `sys_session`
  ADD COLUMN `kind` ENUM('PRE_AUTH', 'AUTHENTICATED') NOT NULL DEFAULT 'AUTHENTICATED' AFTER `userId`;

-- Store the risk level that was effective when an audit event occurred.
ALTER TABLE `sys_audit_log`
  ADD COLUMN `riskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L0' AFTER `action`;

CREATE INDEX `sys_audit_log_riskLevel_createdAt_idx`
  ON `sys_audit_log` (`riskLevel`, `createdAt`);

-- Business operations are registered centrally and reviewed before activation.
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

ALTER TABLE `sys_audit_log`
  ADD COLUMN `operationCode` VARCHAR(128) NULL AFTER `action`;

CREATE INDEX `sys_audit_log_operationCode_createdAt_idx`
  ON `sys_audit_log` (`operationCode`, `createdAt`);

-- Add API lifecycle approval kinds.
ALTER TABLE `sys_approval_request`
  MODIFY `kind` ENUM('ROLE_GRANT', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL;

ALTER TABLE `sys_approval_request` ADD COLUMN `requestNo` VARCHAR(20) NULL;

UPDATE `sys_approval_request`
SET `requestNo` = CONCAT(
  DATE_FORMAT(`createdAt`, '%Y%m%d'),
  '-',
  UPPER(SUBSTRING(REPLACE(`id`, '-', ''), 1, 8))
)
WHERE `requestNo` IS NULL;

ALTER TABLE `sys_approval_request`
  MODIFY `requestNo` VARCHAR(20) NOT NULL;

CREATE UNIQUE INDEX `sys_approval_request_requestNo_key` ON `sys_approval_request`(`requestNo`);

ALTER TABLE `sys_approval_request`
  ADD COLUMN `applicantDisplayName` VARCHAR(128) NULL,
  ADD COLUMN `approverDisplayName` VARCHAR(128) NULL,
  ADD COLUMN `executorDisplayName` VARCHAR(128) NULL,
  ADD COLUMN `reviewerDisplayName` VARCHAR(128) NULL;

UPDATE `sys_approval_request` AS ar
LEFT JOIN `sys_user` AS u1 ON u1.`userId` = ar.`applicantId`
LEFT JOIN `sys_user` AS u2 ON u2.`userId` = ar.`approverId`
LEFT JOIN `sys_user` AS u3 ON u3.`userId` = ar.`executorId`
LEFT JOIN `sys_user` AS u4 ON u4.`userId` = ar.`reviewerId`
SET
  ar.`applicantDisplayName` = u1.`displayName`,
  ar.`approverDisplayName` = u2.`displayName`,
  ar.`executorDisplayName` = u3.`displayName`,
  ar.`reviewerDisplayName` = u4.`displayName`;

ALTER TABLE `sys_approval_request`
  MODIFY `status` ENUM('REQUESTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED';

-- >>> backend/prisma/migrations/20260925090000_localize_button_labels/migration.sql
UPDATE `sys_function_button`
SET `label` = CASE `code`
  WHEN 'button.system.page.create' THEN '新增页面'
  WHEN 'button.system.page.update' THEN '编辑页面'
  WHEN 'button.system.page.disable' THEN '停用页面'
  WHEN 'button.system.page.bind-api' THEN '配置页面接口'
  WHEN 'button.system.button.create' THEN '新增按钮'
  WHEN 'button.system.button.update' THEN '编辑按钮'
  WHEN 'button.system.button.disable' THEN '停用按钮'
  WHEN 'button.system.button.bind-api' THEN '绑定操作接口'
  WHEN 'button.system.user.create' THEN '新增用户'
  WHEN 'button.system.user.update' THEN '编辑用户'
  WHEN 'button.system.user.disable' THEN '停用用户'
  WHEN 'button.system.user.reset-password' THEN '重置密码'
  WHEN 'button.system.user.unlock' THEN '解锁用户'
  WHEN 'button.system.user.grant' THEN '分配角色'
  WHEN 'button.system.role.create' THEN '新增角色'
  WHEN 'button.system.role.update' THEN '编辑角色'
  WHEN 'button.system.role.disable' THEN '停用角色'
  WHEN 'button.system.role.grant' THEN '配置角色权限'
  WHEN 'button.system.role.delete' THEN '删除角色'
  WHEN 'button.system.api.create' THEN '新增接口'
  WHEN 'button.system.api.update' THEN '编辑接口'
  WHEN 'button.system.api.disable' THEN '停用接口'
  WHEN 'button.system.api.delete' THEN '删除接口'
  WHEN 'button.system.audit.export' THEN '导出审计日志'
  WHEN 'button.system.audit.integrity' THEN '校验日志完整性'
  WHEN 'button.system.approval.create' THEN '新建审批申请'
  WHEN 'button.system.approval.approve' THEN '审批通过'
  WHEN 'button.system.approval.execute' THEN '执行审批'
  WHEN 'button.system.approval.review' THEN '审计复核'
  WHEN 'button.system.data.update' THEN '调整数据范围'
  WHEN 'button.system.data.revoke' THEN '撤销数据范围'
  WHEN 'button.system.ops-ticket.create' THEN '新建应急工单'
  WHEN 'button.system.ops-ticket.update' THEN '编辑应急工单'
  WHEN 'button.system.ops-ticket.submit' THEN '提交应急工单'
  WHEN 'button.system.ops-ticket.approve' THEN '审批应急工单'
  WHEN 'button.system.ops-ticket.execute' THEN '执行应急工单'
  WHEN 'button.system.ops-ticket.review' THEN '复核应急工单'
  WHEN 'button.system.ops-ticket.cancel' THEN '取消应急工单'
  WHEN 'button.system.ops-ticket.evidence' THEN '补充工单证据'
  WHEN 'button.system.ops-ticket.executions' THEN '查看执行记录'
  WHEN 'button.system.operation-policy.manage' THEN '管理操作策略'
  WHEN 'button.system.operation-policy.activate' THEN '启用操作策略'
  WHEN 'button.system.operation-policy.disable' THEN '停用操作策略'
  ELSE `label`
END
WHERE `code` LIKE 'button.system.%';

-- >>> backend/prisma/migrations/20260925100000_button_field_permissions/migration.sql
-- Add field-level permissions for button metadata and API bindings.
ALTER TABLE `sys_permission`
  MODIFY `type` ENUM('PAGE', 'BUTTON', 'API', 'MANAGEMENT', 'FIELD') NOT NULL DEFAULT 'API';

INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.label.read', '显示文本查看', 'system.button', 'field.label.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.label.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.label.write', '显示文本修改', 'system.button', 'field.label.write', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.label.write');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.sort.read', '排序查看', 'system.button', 'field.sort.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.sort.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.sort.write', '排序修改', 'system.button', 'field.sort.write', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.sort.write');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.name.read', '按钮名称查看', 'system.button', 'field.name.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.name.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.name.write', '按钮名称修改', 'system.button', 'field.name.write', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.name.write');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.code.read', '权限码查看', 'system.button', 'field.code.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.code.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.code.write', '权限码修改', 'system.button', 'field.code.write', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.code.write');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.status.read', '状态查看', 'system.button', 'field.status.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.status.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.status.write', '状态修改', 'system.button', 'field.status.write', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.status.write');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.apis.read', '操作接口查看', 'system.button', 'field.apis.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.apis.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.button.field.apis.write', '操作接口修改', 'system.button', 'field.apis.write', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.button.field.apis.write');

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '字段权限基线初始化'
FROM `sys_role` r
JOIN `sys_permission` p
  ON p.`type` = 'FIELD' AND p.`resource` = 'system.button'
WHERE r.`roleType` IN ('SECURITY', 'SYSTEM')
ON DUPLICATE KEY UPDATE `revokedAt` = NULL, `revokeReason` = NULL;

-- >>> backend/prisma/migrations/20260925110000_data_field_permissions/migration.sql
ALTER TABLE `sys_permission`
  MODIFY `type` ENUM('PAGE', 'BUTTON', 'API', 'MANAGEMENT', 'FIELD') NOT NULL DEFAULT 'API';

CREATE TABLE `sys_permission_field` (
  `id` CHAR(36) NOT NULL,
  `resource` VARCHAR(128) NOT NULL,
  `field` VARCHAR(128) NOT NULL,
  `name` VARCHAR(128) NOT NULL,
  `dataType` VARCHAR(32) NOT NULL,
  `riskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
  `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
  `readPermissionId` CHAR(36) NOT NULL,
  `writePermissionId` CHAR(36) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sys_permission_field_resource_field_key`(`resource`, `field`),
  INDEX `sys_permission_field_resource_status_idx`(`resource`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), s.`code`, s.`name`, 'system.user', s.`action`, 'FIELD', 'SECURITY', 'ACTIVE'
FROM (
  SELECT 'system.user.field.userId.read' AS `code`, '用户 ID查看' AS `name`, 'field.userId.read' AS `action`
  UNION ALL SELECT 'system.user.field.username.read', '登录账号查看', 'field.username.read'
  UNION ALL SELECT 'system.user.field.username.write', '登录账号修改', 'field.username.write'
  UNION ALL SELECT 'system.user.field.displayName.read', '显示名称查看', 'field.displayName.read'
  UNION ALL SELECT 'system.user.field.displayName.write', '显示名称修改', 'field.displayName.write'
  UNION ALL SELECT 'system.user.field.status.read', '状态查看', 'field.status.read'
  UNION ALL SELECT 'system.user.field.failedLogins.read', '失败次数查看', 'field.failedLogins.read'
  UNION ALL SELECT 'system.user.field.lastLoginAt.read', '最后登录时间查看', 'field.lastLoginAt.read'
  UNION ALL SELECT 'system.user.field.createdAt.read', '创建时间查看', 'field.createdAt.read'
  UNION ALL SELECT 'system.user.field.roles.read', '角色查看', 'field.roles.read'
  UNION ALL SELECT 'system.user.field.password.read', '密码查看', 'field.password.read'
  UNION ALL SELECT 'system.user.field.password.write', '密码修改', 'field.password.write'
) s
LEFT JOIN `sys_permission` p ON p.`code` = s.`code`
WHERE p.`id` IS NULL;

INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `writePermissionId`, `updatedAt`)
SELECT UUID(), f.`resource`, f.`field`, f.`name`, f.`dataType`, f.`riskLevel`, 'ACTIVE', r.`id`, w.`id`, CURRENT_TIMESTAMP(3)
FROM (
  SELECT 'system.user' AS `resource`, 'userId' AS `field`, '用户 ID' AS `name`, 'string' AS `dataType`, 'L1' AS `riskLevel`, 'system.user.field.userId.read' AS `readCode`, NULL AS `writeCode`
  UNION ALL SELECT 'system.user', 'username', '登录账号', 'string', 'L2', 'system.user.field.username.read', 'system.user.field.username.write'
  UNION ALL SELECT 'system.user', 'displayName', '显示名称', 'string', 'L1', 'system.user.field.displayName.read', 'system.user.field.displayName.write'
  UNION ALL SELECT 'system.user', 'status', '状态', 'enum', 'L3', 'system.user.field.status.read', NULL
  UNION ALL SELECT 'system.user', 'failedLogins', '失败次数', 'number', 'L2', 'system.user.field.failedLogins.read', NULL
  UNION ALL SELECT 'system.user', 'lastLoginAt', '最后登录时间', 'datetime', 'L1', 'system.user.field.lastLoginAt.read', NULL
  UNION ALL SELECT 'system.user', 'createdAt', '创建时间', 'datetime', 'L1', 'system.user.field.createdAt.read', NULL
  UNION ALL SELECT 'system.user', 'roles', '角色', 'array', 'L2', 'system.user.field.roles.read', NULL
  UNION ALL SELECT 'system.user', 'password', '密码', 'secret', 'L3', 'system.user.field.password.read', 'system.user.field.password.write'
) f
JOIN `sys_permission` r ON r.`code` = f.`readCode`
LEFT JOIN `sys_permission` w ON w.`code` = f.`writeCode`
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `dataType` = VALUES(`dataType`),
  `riskLevel` = VALUES(`riskLevel`),
  `readPermissionId` = VALUES(`readPermissionId`),
  `writePermissionId` = VALUES(`writePermissionId`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

ALTER TABLE `sys_permission_field`
  ADD CONSTRAINT `sys_permission_field_readPermissionId_fkey`
    FOREIGN KEY (`readPermissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `sys_permission_field_writePermissionId_fkey`
    FOREIGN KEY (`writePermissionId`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '数据字段权限基线初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`type` = 'FIELD' AND p.`resource` = 'system.user'
WHERE r.`roleType` IN ('SECURITY', 'SYSTEM')
ON DUPLICATE KEY UPDATE `revokedAt` = NULL, `revokeReason` = NULL;

-- >>> backend/prisma/migrations/20260925120000_data_field_update_permission/migration.sql
UPDATE `sys_permission` SET `code` = 'system.permission.field.read' WHERE `code` = 'system.data-field.read';
UPDATE `sys_permission` SET `code` = 'system.permission.field.update' WHERE `code` = 'system.data-field.update';
UPDATE `sys_permission` SET `code` = 'system.permission.field.disable' WHERE `code` = 'system.data-field.disable';

INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.permission.field.read', '查询数据字段', 'system.permission.field', 'read', 'API', 'SECURITY', 'ACTIVE', 'GET', '/api/v1/permission/data-fields'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.permission.field.read');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.permission.field.update', '编辑数据字段', 'system.permission.field', 'update', 'API', 'SECURITY', 'ACTIVE', 'PATCH', '/api/v1/permission/data-fields/:id'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.permission.field.update');
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.permission.field.disable', '启停数据字段', 'system.permission.field', 'disable', 'API', 'SECURITY', 'ACTIVE', 'PATCH', '/api/v1/permission/data-fields/:id/status'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.permission.field.disable');

UPDATE `sys_permission` SET `resource` = 'system.permission.field', `action` = 'read', `type` = 'API', `requiredRoleType` = 'SECURITY', `method` = 'GET', `path` = '/api/v1/permission/data-fields'
WHERE `code` = 'system.permission.field.read';
UPDATE `sys_permission` SET `resource` = 'system.permission.field', `action` = 'update', `type` = 'API', `requiredRoleType` = 'SECURITY', `method` = 'PATCH', `path` = '/api/v1/permission/data-fields/:id'
WHERE `code` = 'system.permission.field.update';
UPDATE `sys_permission` SET `resource` = 'system.permission.field', `action` = 'disable', `type` = 'API', `requiredRoleType` = 'SECURITY', `method` = 'PATCH', `path` = '/api/v1/permission/data-fields/:id/status'
WHERE `code` = 'system.permission.field.disable';

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '数据字段编辑权限初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` IN ('system.permission.field.read', 'system.permission.field.update', 'system.permission.field.disable')
WHERE r.`roleType` IN ('SECURITY', 'SYSTEM')
ON DUPLICATE KEY UPDATE `revokedAt` = NULL, `revokeReason` = NULL;

-- >>> backend/prisma/migrations/20260925130000_rename_field_management_paths/migration.sql
UPDATE `sys_permission`
SET `path` = '/api/v1/permission/fields'
WHERE `code` = 'system.permission.field.read';

UPDATE `sys_permission`
SET `path` = '/api/v1/permission/fields/:id'
WHERE `code` = 'system.permission.field.update';

UPDATE `sys_permission`
SET `path` = '/api/v1/permission/fields/:id/status'
WHERE `code` = 'system.permission.field.disable';

-- >>> backend/prisma/migrations/20260925140000_relation_field_metadata/migration.sql
ALTER TABLE `sys_permission_field`
  ADD COLUMN `relationResource` VARCHAR(128) NULL,
  ADD COLUMN `relationModel` VARCHAR(128) NULL;

-- >>> backend/prisma/migrations/20260925150000_relation_response_field/migration.sql
ALTER TABLE `sys_permission_field`
  ADD COLUMN `relationField` VARCHAR(128) NULL;

-- >>> backend/prisma/migrations/20260926140000_standardize_permission_codes/migration.sql
-- 统一权限码命名。
--
-- 先把旧码移动到临时命名空间，避免目标权限码与旧权限码在唯一索引上冲突；
-- 再写入规范码。角色授权关系使用 permissionId，不需要重建关联记录。
START TRANSACTION;

UPDATE `sys_permission`
SET `code` = CONCAT('__legacy_permission__', `id`)
WHERE `code` IN (
  'system.page.disable',
  'system.page.bind-api',
  'system.page.apis',
  'system.page.api-options',
  'system.button.disable',
  'system.button.bind-api',
  'system.api.disable',
  'system.user.disable',
  'system.role.disable',
  'system.data.read',
  'system.data.update',
  'system.data.revoke',
  'system.permission.field.read',
  'system.permission.field.update',
  'system.permission.field.disable',
  'system.ops-ticket.evidence',
  'system.ops-ticket.executions',
  'system.operation-policy.manage',
  'system.operation-policy.disable'
);

UPDATE `sys_permission`
SET
  `code` = CASE `code`
    WHEN CONCAT('__legacy_permission__', `id`) THEN CASE `resource`
      WHEN 'system.page' THEN CASE `action`
        WHEN 'disable' THEN 'system.page.status'
        WHEN 'bind-api' THEN 'system.page.api.bind'
        WHEN 'apis' THEN 'system.page.api.read'
        WHEN 'api-options' THEN 'system.page.api.options'
        ELSE `code`
      END
      WHEN 'system.button' THEN CASE `action`
        WHEN 'disable' THEN 'system.button.status'
        WHEN 'bind-api' THEN 'system.button.api.bind'
        ELSE `code`
      END
      WHEN 'system.api' THEN CASE `action`
        WHEN 'disable' THEN 'system.api.disable'
        ELSE `code`
      END
      WHEN 'system.user' THEN CASE `action`
        WHEN 'disable' THEN 'system.user.disable'
        ELSE `code`
      END
      WHEN 'system.role' THEN CASE `action`
        WHEN 'disable' THEN 'system.role.disable'
        ELSE `code`
      END
      WHEN 'system.data' THEN CASE `action`
        WHEN 'read' THEN 'system.data-scope.read'
        WHEN 'update' THEN 'system.data-scope.update'
        WHEN 'revoke' THEN 'system.data-scope.revoke'
        ELSE `code`
      END
      WHEN 'system.permission.field' THEN CASE `action`
        WHEN 'read' THEN 'system.field.read'
        WHEN 'update' THEN 'system.field.update'
        WHEN 'disable' THEN 'system.field.status'
        ELSE `code`
      END
      WHEN 'system.ops-ticket' THEN CASE `action`
        WHEN 'evidence' THEN 'system.ops-ticket.evidence.create'
        WHEN 'executions' THEN 'system.ops-ticket.execution.create'
        ELSE `code`
      END
      WHEN 'system.operation-policy' THEN CASE `action`
        WHEN 'manage' THEN 'system.operation-policy.create'
        WHEN 'disable' THEN 'system.operation-policy.status'
        ELSE `code`
      END
      ELSE `code`
    END
    ELSE `code`
  END,
  `resource` = CASE `resource`
    WHEN 'system.page' THEN CASE `action`
      WHEN 'disable' THEN 'system.page'
      WHEN 'bind-api' THEN 'system.page.api'
      WHEN 'apis' THEN 'system.page.api'
      WHEN 'api-options' THEN 'system.page.api'
      ELSE `resource`
    END
    WHEN 'system.button' THEN CASE `action`
      WHEN 'disable' THEN 'system.button'
      WHEN 'bind-api' THEN 'system.button.api'
      ELSE `resource`
    END
    WHEN 'system.data' THEN 'system.data-scope'
    WHEN 'system.permission.field' THEN 'system.field'
    WHEN 'system.ops-ticket' THEN CASE `action`
      WHEN 'evidence' THEN 'system.ops-ticket.evidence'
      WHEN 'executions' THEN 'system.ops-ticket.execution'
      ELSE `resource`
    END
    ELSE `resource`
  END,
  `action` = CASE `resource`
    WHEN 'system.page' THEN CASE `action`
      WHEN 'disable' THEN 'status'
      WHEN 'bind-api' THEN 'bind'
      WHEN 'apis' THEN 'read'
      WHEN 'api-options' THEN 'options'
      ELSE `action`
    END
    WHEN 'system.button' THEN CASE `action`
      WHEN 'disable' THEN 'status'
      WHEN 'bind-api' THEN 'bind'
      ELSE `action`
    END
    WHEN 'system.data' THEN `action`
    WHEN 'system.permission.field' THEN CASE `action`
      WHEN 'disable' THEN 'status'
      ELSE `action`
    END
    WHEN 'system.ops-ticket' THEN CASE `action`
      WHEN 'evidence' THEN 'create'
      WHEN 'executions' THEN 'create'
      ELSE `action`
    END
    WHEN 'system.operation-policy' THEN CASE `action`
      WHEN 'manage' THEN 'create'
      WHEN 'disable' THEN 'status'
      ELSE `action`
    END
    ELSE `action`
  END
WHERE `code` LIKE '__legacy_permission__%';

-- 按钮权限本身也是 sys_permission 记录，必须与按钮实体一起迁移。
UPDATE `sys_permission`
SET `code` = CONCAT('__legacy_permission__', `id`)
WHERE `type` = 'BUTTON'
  AND `code` IN (
    'button.system.page.api-options',
    'button.system.page.apis',
    'button.system.page.bind-api',
    'button.system.page.disable',
    'button.system.button.bind-api',
    'button.system.button.disable',
    'button.system.api.disable',
    'button.system.user.disable',
    'button.system.role.disable',
    'button.system.data.update',
    'button.system.data.revoke',
    'button.system.permission.field.update',
    'button.system.permission.field.disable',
    'button.system.ops-ticket.evidence',
    'button.system.ops-ticket.executions',
    'button.system.operation-policy.manage',
    'button.system.operation-policy.disable'
  );

UPDATE `sys_permission`
SET
  `code` = CASE
    WHEN `resource` = 'system.page' AND `action` = 'api-options' THEN 'button.system.page.api.options'
    WHEN `resource` = 'system.page' AND `action` = 'apis' THEN 'button.system.page.api.read'
    WHEN `resource` = 'system.page' AND `action` = 'bind-api' THEN 'button.system.page.api.bind'
    WHEN `resource` = 'system.page' AND `action` = 'disable' THEN 'button.system.page.status'
    WHEN `resource` = 'system.button' AND `action` = 'bind-api' THEN 'button.system.button.api.bind'
    WHEN `resource` = 'system.button' AND `action` = 'disable' THEN 'button.system.button.status'
    WHEN `resource` = 'system.api' AND `action` = 'disable' THEN 'button.system.api.disable'
    WHEN `resource` = 'system.user' AND `action` = 'disable' THEN 'button.system.user.disable'
    WHEN `resource` = 'system.role' AND `action` = 'disable' THEN 'button.system.role.disable'
    WHEN `resource` = 'system.data' AND `action` = 'update' THEN 'button.system.data-scope.update'
    WHEN `resource` = 'system.data' AND `action` = 'revoke' THEN 'button.system.data-scope.revoke'
    WHEN `resource` = 'system.permission.field' AND `action` = 'update' THEN 'button.system.field.update'
    WHEN `resource` = 'system.permission.field' AND `action` = 'disable' THEN 'button.system.field.status'
    WHEN `resource` = 'system.ops-ticket' AND `action` = 'evidence' THEN 'button.system.ops-ticket.evidence.create'
    WHEN `resource` = 'system.ops-ticket' AND `action` = 'executions' THEN 'button.system.ops-ticket.execution.create'
    WHEN `resource` = 'system.operation-policy' AND `action` = 'manage' THEN 'button.system.operation-policy.create'
    WHEN `resource` = 'system.operation-policy' AND `action` = 'disable' THEN 'button.system.operation-policy.status'
    ELSE `code`
  END,
  `resource` = CASE
    WHEN `resource` = 'system.page' AND `action` IN ('api-options', 'apis', 'bind-api') THEN 'system.page.api'
    WHEN `resource` = 'system.data' THEN 'system.data-scope'
    WHEN `resource` = 'system.permission.field' THEN 'system.field'
    WHEN `resource` = 'system.ops-ticket' AND `action` = 'evidence' THEN 'system.ops-ticket.evidence'
    WHEN `resource` = 'system.ops-ticket' AND `action` = 'executions' THEN 'system.ops-ticket.execution'
    ELSE `resource`
  END,
  `action` = CASE
    WHEN `resource` = 'system.page' AND `action` = 'api-options' THEN 'options'
    WHEN `resource` = 'system.page' AND `action` = 'apis' THEN 'read'
    WHEN `resource` = 'system.page' AND `action` = 'bind-api' THEN 'bind'
    WHEN `resource` = 'system.page' AND `action` = 'disable' THEN 'status'
    WHEN `resource` = 'system.button' AND `action` = 'bind-api' THEN 'bind'
    WHEN `resource` IN ('system.button', 'system.api', 'system.user', 'system.role') AND `action` = 'disable' THEN 'status'
    WHEN `resource` = 'system.data' THEN `action`
    WHEN `resource` = 'system.permission.field' AND `action` = 'disable' THEN 'status'
    WHEN `resource` = 'system.ops-ticket' AND `action` IN ('evidence', 'executions') THEN 'create'
    WHEN `resource` = 'system.operation-policy' AND `action` = 'manage' THEN 'create'
    WHEN `resource` = 'system.operation-policy' AND `action` = 'disable' THEN 'status'
    ELSE `action`
  END
WHERE `code` LIKE '__legacy_permission__%'
  AND `type` = 'BUTTON';

UPDATE `sys_function_button`
SET `code` = CONCAT('__legacy_button__', `id`)
WHERE `code` IN (
  'button.system.page.disable',
  'button.system.page.bind-api',
  'button.system.button.disable',
  'button.system.button.bind-api',
  'button.system.api.disable',
  'button.system.user.disable',
  'button.system.role.disable',
  'button.system.data.update',
  'button.system.data.revoke',
  'button.system.ops-ticket.evidence',
  'button.system.ops-ticket.executions',
  'button.system.operation-policy.manage',
  'button.system.operation-policy.disable'
);

-- 按钮实体的规范码始终与其绑定的 BUTTON 权限码一致。
UPDATE `sys_function_button`
SET `code` = (
  SELECT `code`
  FROM `sys_permission`
  WHERE `sys_permission`.`id` = `sys_function_button`.`permissionId`
)
WHERE `code` LIKE '__legacy_button__%';

COMMIT;

-- >>> backend/prisma/migrations/20260926150000_reconcile_legacy_button_permissions/migration.sql
-- 退役已执行旧迁移或旧 seed 产生的 BUTTON 权限。
-- 不删除权限、按钮、角色授权和接口绑定，保留完整审计与回滚依据。
-- 新规范权限由 seed 建立；旧角色需要显式重新授予新权限。
START TRANSACTION;

UPDATE `sys_permission`
SET
  `code` = CONCAT('__retired_button_permission__', `id`),
  `status` = 'DISABLED'
WHERE `type` = 'BUTTON'
  AND `code` IN (
    'button.system.page.api-options',
    'button.system.page.apis',
    'button.system.page.bind-api',
    'button.system.page.disable',
    'button.system.button.bind-api',
    'button.system.button.disable',
    'button.system.api.disable',
    'button.system.user.disable',
    'button.system.role.disable',
    'button.system.data.update',
    'button.system.data.revoke',
    'button.system.permission.field.update',
    'button.system.permission.field.disable',
    'button.system.ops-ticket.evidence',
    'button.system.ops-ticket.executions',
    'button.system.operation-policy.manage',
    'button.system.operation-policy.disable'
  );

UPDATE `sys_function_button`
SET
  `code` = CONCAT('__retired_button_entity__', `id`),
  `status` = 'DISABLED'
WHERE `code` IN (
    'button.system.page.api-options',
    'button.system.page.apis',
    'button.system.page.bind-api',
    'button.system.page.disable',
    'button.system.button.bind-api',
    'button.system.button.disable',
    'button.system.api.disable',
    'button.system.user.disable',
    'button.system.role.disable',
    'button.system.data.update',
    'button.system.data.revoke',
    'button.system.permission.field.update',
    'button.system.permission.field.disable',
    'button.system.ops-ticket.evidence',
    'button.system.ops-ticket.executions',
    'button.system.operation-policy.manage',
    'button.system.operation-policy.disable'
  )
   OR `code` LIKE '__legacy_button__%';

COMMIT;

-- >>> backend/prisma/migrations/20260926160000_approval_target_refs/migration.sql
-- Short-lived references prevent the approval form from accepting arbitrary target IDs.
CREATE TABLE `sys_approval_target_ref` (
    `id` CHAR(36) NOT NULL,
    `tokenHash` CHAR(64) NOT NULL,
    `actorUserId` CHAR(36) NOT NULL,
    `kind` ENUM('ROLE_GRANT', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL,
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

-- >>> backend/prisma/migrations/20260926170000_page_node_type/migration.sql
-- Explicitly distinguish menu directories from routable pages.
ALTER TABLE `sys_function`
  ADD COLUMN `nodeType` ENUM('DIRECTORY', 'PAGE') NOT NULL DEFAULT 'PAGE';

-- Preserve the previous convention for existing layout-only nodes.
UPDATE `sys_function`
SET `nodeType` = 'DIRECTORY'
WHERE `component` IS NULL;

-- >>> backend/prisma/migrations/20260926180000_navigation_metadata/migration.sql
ALTER TABLE `sys_function`
  ADD COLUMN `icon` VARCHAR(128) NULL,
  ADD COLUMN `routeProps` JSON NULL;

-- >>> backend/prisma/migrations/20260926200000_directory_route_codes/migration.sql
UPDATE `sys_function`
SET `code` = 'system', `permissionId` = NULL
WHERE `nodeType` = 'DIRECTORY'
  AND `route` = '/system';

UPDATE `sys_function`
SET `code` = SUBSTRING(`code`, 11)
WHERE `nodeType` = 'DIRECTORY'
  AND `code` LIKE 'directory.%';

-- >>> backend/prisma/migrations/20260926210000_role_status_approval/migration.sql
ALTER TABLE `sys_approval_request`
  MODIFY `kind` ENUM('ROLE_GRANT', 'ROLE_STATUS', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL;

ALTER TABLE `sys_approval_target_ref`
  MODIFY `kind` ENUM('ROLE_GRANT', 'ROLE_STATUS', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL;

-- >>> backend/prisma/migrations/20260926220000_approval_kind_label_field/migration.sql
INSERT INTO `sys_permission` (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.approval.field.kindLabel.read', '审批类型名称查看', 'system.approval', 'field.kindLabel.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.approval.field.kindLabel.read'
);

INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `writePermissionId`, `updatedAt`)
SELECT UUID(), 'system.approval', 'kindLabel', '审批类型名称', 'string', 'L1', 'ACTIVE', p.`id`, NULL, CURRENT_TIMESTAMP(3)
FROM `sys_permission` p
WHERE p.`code` = 'system.approval.field.kindLabel.read'
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `dataType` = VALUES(`dataType`),
  `riskLevel` = VALUES(`riskLevel`),
  `readPermissionId` = VALUES(`readPermissionId`),
  `writePermissionId` = VALUES(`writePermissionId`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '审批类型中文映射字段权限初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` = 'system.approval.field.kindLabel.read'
WHERE r.`roleType` IN ('SECURITY', 'AUDIT')
ON DUPLICATE KEY UPDATE `revokedAt` = NULL, `revokeReason` = NULL;

-- >>> backend/prisma/migrations/20260926230000_data_field_create_api/migration.sql
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.field.create', '新增字段权限', 'system.field', 'create', 'API', 'SECURITY', 'ACTIVE', 'POST', '/api/v1/permission/fields'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.field.create'
);

-- >>> backend/prisma/migrations/20260927090000_activate_builtin_business_role/migration.sql
UPDATE `sys_role`
SET `status` = 'ACTIVE'
WHERE `code` = 'builtin_business'
  AND `roleType` = 'BUSINESS';

-- >>> backend/prisma/migrations/20260927100000_role_assignment_options_api/migration.sql
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.role.assignment-options', '角色分配选项', 'system.role', 'assignment-options', 'API', 'SECURITY', 'ACTIVE', 'GET', '/api/v1/roles/assignment-options'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.role.assignment-options'
);

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '受控权限目录迁移'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` = 'system.role.assignment-options'
WHERE r.`code` = 'builtin_security'
  AND NOT EXISTS (
    SELECT 1 FROM `sys_role_permission` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionId` = p.`id`
  );

-- >>> backend/prisma/migrations/20260927110000_user_role_assignment_approval_flag/migration.sql
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.user.field.roleAssignmentRequiresApproval.read', '角色分配审批标记查看', 'system.user', 'field.roleAssignmentRequiresApproval.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.user.field.roleAssignmentRequiresApproval.read'
);

INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `writePermissionId`, `updatedAt`)
SELECT UUID(), 'system.user', 'roleAssignmentRequiresApproval', '角色分配审批标记', 'boolean', 'L3', 'ACTIVE', p.`id`, NULL, CURRENT_TIMESTAMP(3)
FROM `sys_permission` p
WHERE p.`code` = 'system.user.field.roleAssignmentRequiresApproval.read'
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `dataType` = VALUES(`dataType`),
  `riskLevel` = VALUES(`riskLevel`),
  `readPermissionId` = VALUES(`readPermissionId`),
  `updatedAt` = CURRENT_TIMESTAMP(3);

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '角色分配审批标记字段权限初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` = 'system.user.field.roleAssignmentRequiresApproval.read'
WHERE r.`roleType` IN ('SECURITY', 'SYSTEM')
ON DUPLICATE KEY UPDATE `revokedAt` = NULL, `revokeReason` = NULL;

-- >>> backend/prisma/migrations/20260927120000_rename_role_approval_flag/migration.sql
UPDATE `sys_permission`
SET
  `code` = 'system.user.field.needsRoleApproval.read',
  `action` = 'field.needsRoleApproval.read',
  `name` = '角色审批标记查看'
WHERE `code` = 'system.user.field.roleAssignmentRequiresApproval.read';

UPDATE `sys_permission_field`
SET
  `field` = 'needsRoleApproval',
  `name` = '角色审批标记查看',
  `readPermissionId` = (
    SELECT `id` FROM `sys_permission`
    WHERE `code` = 'system.user.field.needsRoleApproval.read'
  ),
  `updatedAt` = CURRENT_TIMESTAMP(3)
WHERE `resource` = 'system.user'
  AND `field` = 'roleAssignmentRequiresApproval';

-- >>> backend/prisma/migrations/20260927130000_data_resource_dictionary/migration.sql
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

INSERT INTO `sys_data_resource` (`id`, `code`, `name`, `status`, `createdAt`, `updatedAt`)
SELECT UUID(), `resource`, `resource`, 'ACTIVE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM (
  SELECT DISTINCT `resource` FROM `sys_role_data_scope`
  UNION
  SELECT DISTINCT `resource` FROM `sys_role_elevated_data_scope`
) AS existing_resources
WHERE `resource` REGEXP '^[a-z][a-z0-9_.:-]{0,127}$';

ALTER TABLE `sys_role_data_scope`
  ADD CONSTRAINT `sys_role_data_scope_resource_fkey`
  FOREIGN KEY (`resource`) REFERENCES `sys_data_resource`(`code`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `sys_role_elevated_data_scope`
  ADD CONSTRAINT `sys_role_elevated_data_scope_resource_fkey`
  FOREIGN KEY (`resource`) REFERENCES `sys_data_resource`(`code`)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.data-resource.read', '查询数据对象', 'system.data-resource', 'read', 'API', 'SECURITY', 'ACTIVE', 'GET', '/api/v1/permission/data-resources'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.data-resource.read'
);
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.data-resource.create', '新增数据对象', 'system.data-resource', 'create', 'API', 'SECURITY', 'ACTIVE', 'POST', '/api/v1/permission/data-resources'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.data-resource.create'
);
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.data-resource.update', '编辑数据对象', 'system.data-resource', 'update', 'API', 'SECURITY', 'ACTIVE', 'PATCH', '/api/v1/permission/data-resources/:id'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.data-resource.update'
);
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.data-resource.status', '启停数据对象', 'system.data-resource', 'status', 'API', 'SECURITY', 'ACTIVE', 'PATCH', '/api/v1/permission/data-resources/:id/status'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.data-resource.status'
);

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '资源字典初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` = 'system.data-resource.read'
WHERE r.`code` = 'builtin_security'
  AND NOT EXISTS (
    SELECT 1 FROM `sys_role_permission` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionId` = p.`id`
  );

-- >>> backend/prisma/migrations/20260927140000_role_grants_read_api/migration.sql
INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`, `method`, `path`)
SELECT UUID(), 'system.role.grants.read', '查询角色授权', 'system.role', 'grants.read', 'API', 'SECURITY', 'ACTIVE', 'GET', '/api/v1/roles/:id/grants'
WHERE NOT EXISTS (
  SELECT 1 FROM `sys_permission` WHERE `code` = 'system.role.grants.read'
);

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '角色授权查询接口初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` = 'system.role.grants.read'
WHERE r.`code` = 'builtin_security'
  AND NOT EXISTS (
    SELECT 1 FROM `sys_role_permission` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionId` = p.`id`
  );

INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.role.field.roleTypeLabel.read', '角色类型名称查看', 'system.role', 'field.roleTypeLabel.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.role.field.roleTypeLabel.read');
INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'system.role', 'roleTypeLabel', '角色类型名称', 'string', 'L1', 'ACTIVE', p.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `sys_permission` p
WHERE p.`code` = 'system.role.field.roleTypeLabel.read'
  AND NOT EXISTS (SELECT 1 FROM `sys_permission_field` WHERE `resource` = 'system.role' AND `field` = 'roleTypeLabel');

INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.role.field.statusLabel.read', '角色状态名称查看', 'system.role', 'field.statusLabel.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.role.field.statusLabel.read');
INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'system.role', 'statusLabel', '角色状态名称', 'string', 'L1', 'ACTIVE', p.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `sys_permission` p
WHERE p.`code` = 'system.role.field.statusLabel.read'
  AND NOT EXISTS (SELECT 1 FROM `sys_permission_field` WHERE `resource` = 'system.role' AND `field` = 'statusLabel');

INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.role.field.isActive.read', '是否启用查看', 'system.role', 'field.isActive.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.role.field.isActive.read');
INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'system.role', 'isActive', '是否启用', 'boolean', 'L1', 'ACTIVE', p.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `sys_permission` p
WHERE p.`code` = 'system.role.field.isActive.read'
  AND NOT EXISTS (SELECT 1 FROM `sys_permission_field` WHERE `resource` = 'system.role' AND `field` = 'isActive');

INSERT INTO `sys_permission`
  (`id`, `code`, `name`, `resource`, `action`, `type`, `requiredRoleType`, `status`)
SELECT UUID(), 'system.role.field.capabilities.read', '角色操作能力查看', 'system.role', 'field.capabilities.read', 'FIELD', 'SECURITY', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM `sys_permission` WHERE `code` = 'system.role.field.capabilities.read');
INSERT INTO `sys_permission_field`
  (`id`, `resource`, `field`, `name`, `dataType`, `riskLevel`, `status`, `readPermissionId`, `createdAt`, `updatedAt`)
SELECT UUID(), 'system.role', 'capabilities', '角色操作能力', 'object', 'L2', 'ACTIVE', p.`id`, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `sys_permission` p
WHERE p.`code` = 'system.role.field.capabilities.read'
  AND NOT EXISTS (SELECT 1 FROM `sys_permission_field` WHERE `resource` = 'system.role' AND `field` = 'capabilities');

INSERT INTO `sys_role_permission` (`roleId`, `permissionId`, `grantReason`)
SELECT r.`id`, p.`id`, '角色列表字段权限初始化'
FROM `sys_role` r
JOIN `sys_permission` p ON p.`code` IN (
  'system.role.field.roleTypeLabel.read',
  'system.role.field.statusLabel.read',
  'system.role.field.isActive.read',
  'system.role.field.capabilities.read'
)
WHERE r.`code` = 'builtin_security'
  AND NOT EXISTS (
    SELECT 1 FROM `sys_role_permission` rp
    WHERE rp.`roleId` = r.`id` AND rp.`permissionId` = p.`id`
  );

-- >>> backend/prisma/migrations/20260927150000_bind_role_grants_read_api/migration.sql
INSERT INTO `sys_function_api` (`functionId`, `apiId`, `required`)
SELECT f.`id`, p.`id`, 1
FROM `sys_function` f
JOIN `sys_permission` p ON p.`code` = 'system.role.grants.read'
WHERE f.`code` = 'page.system.role'
  AND NOT EXISTS (
    SELECT 1
    FROM `sys_function_api` existing
    WHERE existing.`functionId` = f.`id`
      AND existing.`apiId` = p.`id`
  );

-- >>> backend/prisma/migrations/20260927160000_order_module/migration.sql
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

-- AddForeignKey
ALTER TABLE `biz_order` ADD CONSTRAINT `biz_order_tenantId_fkey`
  FOREIGN KEY (`tenantId`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `biz_order` ADD CONSTRAINT `biz_order_ownerId_fkey`
  FOREIGN KEY (`ownerId`) REFERENCES `sys_user`(`userId`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- >>> backend/prisma/migrations/20260927170000_permission_role_types/migration.sql
-- CreateTable
CREATE TABLE `sys_permission_role_type` (
    `permissionId` CHAR(36) NOT NULL,
    `roleType` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL,

    INDEX `sys_permission_role_type_roleType_permissionId_idx`(`roleType`, `permissionId`),
    PRIMARY KEY (`permissionId`, `roleType`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_permission_role_type` ADD CONSTRAINT `sys_permission_role_type_permissionId_fkey`
  FOREIGN KEY (`permissionId`) REFERENCES `sys_permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the default audience before enabling explicit catalog audiences.
INSERT INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, `requiredRoleType` FROM `sys_permission`;

-- Remove legacy default audiences where the explicit policy is narrower.
DELETE prt FROM `sys_permission_role_type` prt
JOIN `sys_permission` p ON p.`id` = prt.`permissionId`
WHERE p.`code` IN ('page.system.approval', 'system.approval.read', 'system.approval.detail')
  AND prt.`roleType` = 'BUSINESS';

-- Read-only emergency and approval visibility is intentionally shared.
INSERT IGNORE INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, 'SYSTEM' FROM `sys_permission`
WHERE `code` IN ('page.system.ops-tickets', 'system.ops-ticket.read', 'system.ops-ticket.detail');
INSERT IGNORE INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, 'AUDIT' FROM `sys_permission`
WHERE `code` IN ('page.system.ops-tickets', 'system.ops-ticket.read', 'system.ops-ticket.detail');
INSERT IGNORE INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, 'SECURITY' FROM `sys_permission`
WHERE `code` IN ('system.approval.read', 'system.approval.detail');
INSERT IGNORE INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, 'AUDIT' FROM `sys_permission`
WHERE `code` IN ('page.system.approval', 'system.approval.read', 'system.approval.detail');

-- Field definitions are maintained by security administrators and consumed
-- by both security and system administrators.
INSERT IGNORE INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, 'SYSTEM' FROM `sys_permission` WHERE `type` = 'FIELD';

-- System administrators may operate emergency tickets; audit administrators
-- only review them.
INSERT IGNORE INTO `sys_permission_role_type` (`permissionId`, `roleType`)
SELECT `id`, 'SYSTEM' FROM `sys_permission`
WHERE `code` IN (
  'system.ops-ticket.create', 'system.ops-ticket.update', 'system.ops-ticket.submit',
  'system.ops-ticket.approve', 'system.ops-ticket.execute', 'system.ops-ticket.cancel',
  'system.ops-ticket.evidence.create', 'system.ops-ticket.execution.create'
);

-- >>> backend/prisma/migrations/20260927180000_remove_required_role_type/migration.sql
-- The normalized permission-role audience is now authoritative.
ALTER TABLE `sys_permission` DROP COLUMN `requiredRoleType`;
