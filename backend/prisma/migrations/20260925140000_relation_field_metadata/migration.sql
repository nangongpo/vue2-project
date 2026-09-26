ALTER TABLE `sys_permission_field`
  ADD COLUMN `relationResource` VARCHAR(128) NULL,
  ADD COLUMN `relationModel` VARCHAR(128) NULL;
