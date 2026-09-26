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
