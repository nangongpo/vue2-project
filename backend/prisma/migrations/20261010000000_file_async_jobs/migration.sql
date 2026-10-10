ALTER TABLE `sys_upload_session`
  MODIFY `status` ENUM('UPLOADING', 'FINALIZING', 'SCANNING', 'COMPLETED', 'FAILED', 'ABORTED', 'EXPIRED') NOT NULL DEFAULT 'UPLOADING',
  ADD COLUMN `idempotency_key` VARCHAR(128) NULL,
  ADD UNIQUE INDEX `sys_upload_session_user_id_idempotency_key_uq`(`user_id`, `idempotency_key`);

CREATE TABLE `sys_file_finalize_job` (
  `id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `upload_id` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'INFECTED', 'FAILED', 'DEAD_LETTER', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` INTEGER UNSIGNED NOT NULL DEFAULT 5,
  `next_retry_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `locked_at` DATETIME(3) NULL,
  `locked_by` VARCHAR(128) NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `last_error` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `sys_file_finalize_job_upload_id_key`(`upload_id`),
  INDEX `sys_file_finalize_job_status_next_retry_at_idx`(`status`, `next_retry_at`),
  INDEX `sys_file_finalize_job_locked_at_idx`(`locked_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `sys_file_scan_job` (
  `id` CHAR(36) NOT NULL,
  `file_id` CHAR(36) NOT NULL,
  `status` ENUM('PENDING', 'RUNNING', 'SUCCEEDED', 'INFECTED', 'FAILED', 'DEAD_LETTER', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
  `attempts` INTEGER UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` INTEGER UNSIGNED NOT NULL DEFAULT 5,
  `next_retry_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `locked_at` DATETIME(3) NULL,
  `locked_by` VARCHAR(128) NULL,
  `started_at` DATETIME(3) NULL,
  `finished_at` DATETIME(3) NULL,
  `last_error` VARCHAR(512) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `sys_file_scan_job_status_next_retry_at_idx`(`status`, `next_retry_at`),
  INDEX `sys_file_scan_job_file_id_created_at_idx`(`file_id`, `created_at`),
  INDEX `sys_file_scan_job_locked_at_idx`(`locked_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `sys_file_finalize_job`
  ADD CONSTRAINT `sys_file_finalize_job_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `sys_file_object`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT,
  ADD CONSTRAINT `sys_file_finalize_job_upload_id_fkey` FOREIGN KEY (`upload_id`) REFERENCES `sys_upload_session`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE `sys_file_scan_job`
  ADD CONSTRAINT `sys_file_scan_job_file_id_fkey` FOREIGN KEY (`file_id`) REFERENCES `sys_file_object`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
