UPDATE `sys_permission`
SET `path` = '/api/v1/permission/fields'
WHERE `code` = 'system.permission.field.read';

UPDATE `sys_permission`
SET `path` = '/api/v1/permission/fields/:id'
WHERE `code` = 'system.permission.field.update';

UPDATE `sys_permission`
SET `path` = '/api/v1/permission/fields/:id/status'
WHERE `code` = 'system.permission.field.disable';
