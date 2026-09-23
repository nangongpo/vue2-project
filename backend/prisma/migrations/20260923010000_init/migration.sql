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

