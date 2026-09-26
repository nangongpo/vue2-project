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
