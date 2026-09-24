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
