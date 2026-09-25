
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
    `status` ENUM('REQUESTED', 'APPROVED', 'EXECUTED', 'REVIEWED') NOT NULL DEFAULT 'REQUESTED',
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
  MODIFY `kind` ENUM('ROLE_GRANT', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_STATUS', 'API_DELETE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL;

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
