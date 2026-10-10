ALTER TABLE `sys_session`
  ADD COLUMN `active_tenant_id` CHAR(36) NULL,
  ADD INDEX `sys_session_active_tenant_id_idx` (`active_tenant_id`),
  ADD CONSTRAINT `sys_session_active_tenant_id_fkey`
    FOREIGN KEY (`active_tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE TABLE `sys_user_tenant_membership` (
  `id` CHAR(36) NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `tenant_id` CHAR(36) NOT NULL,
  `status` ENUM('ACTIVE', 'SUSPENDED', 'EXPIRED', 'REVOKED') NOT NULL DEFAULT 'ACTIVE',
  `is_default` BOOLEAN NOT NULL DEFAULT false,
  `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sys_user_tenant_membership_user_id_tenant_id_key` (`user_id`, `tenant_id`),
  INDEX `sys_user_tenant_membership_user_id_status_expires_at_idx` (`user_id`, `status`, `expires_at`),
  INDEX `sys_user_tenant_membership_tenant_id_status_idx` (`tenant_id`, `status`),
  PRIMARY KEY (`id`),
  CONSTRAINT `sys_user_tenant_membership_user_id_fkey`
    FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT `sys_user_tenant_membership_tenant_id_fkey`
    FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 兼容已有单租户数据：只把用户当前明确绑定的租户迁移为成员关系，不猜测缺失的租户。
INSERT INTO `sys_user_tenant_membership`
  (`id`, `user_id`, `tenant_id`, `status`, `is_default`, `assigned_at`, `created_at`, `updated_at`)
SELECT UUID(), `id`, `tenant_id`, 'ACTIVE', true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `sys_user`
WHERE `tenant_id` IS NOT NULL;

UPDATE `sys_session` s
JOIN `sys_user` u ON u.`id` = s.`user_id`
SET s.`active_tenant_id` = u.`tenant_id`
WHERE s.`active_tenant_id` IS NULL AND u.`tenant_id` IS NOT NULL;
