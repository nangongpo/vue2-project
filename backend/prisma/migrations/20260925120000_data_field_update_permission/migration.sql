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
