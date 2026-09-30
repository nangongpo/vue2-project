-- CreateTable
CREATE TABLE `sys_user` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` CHAR(36) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `password_changed_at` DATETIME(3) NULL,
    `display_name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'LOCKED', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `failed_logins` INTEGER NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(64) NULL,
    `expires_at` DATETIME(3) NULL,
    `mfa_secret` VARCHAR(512) NULL,
    `mfa_enabled` BOOLEAN NOT NULL DEFAULT false,
    `mfa_last_step` BIGINT NULL,
    `tenant_id` CHAR(36) NULL,
    `department_id` CHAR(36) NULL,
    `organization_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_user_user_id_key`(`user_id`),
    UNIQUE INDEX `sys_user_username_key`(`username`),
    INDEX `sys_user_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `biz_order` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `order_id` CHAR(36) NOT NULL,
    `order_no` VARCHAR(40) NOT NULL,
    `tenant_id` CHAR(36) NULL,
    `owner_id` CHAR(36) NOT NULL,
    `department_id` CHAR(36) NULL,
    `organization_id` CHAR(36) NULL,
    `customer_name` VARCHAR(128) NOT NULL,
    `total_amount` DECIMAL(18, 2) NOT NULL,
    `currency` CHAR(3) NOT NULL DEFAULT 'CNY',
    `status` ENUM('DRAFT', 'CONFIRMED', 'CANCELLED', 'COMPLETED') NOT NULL DEFAULT 'DRAFT',
    `remark` VARCHAR(500) NULL,
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `biz_order_order_id_key`(`order_id`),
    UNIQUE INDEX `biz_order_order_no_key`(`order_no`),
    INDEX `biz_order_tenant_id_status_created_at_idx`(`tenant_id`, `status`, `created_at`),
    INDEX `biz_order_owner_id_created_at_idx`(`owner_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_password_history` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `password` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_password_history_user_id_created_at_id_idx`(`user_id`, `created_at`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role` (
    `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `role_id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `role_type` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL DEFAULT 'BUSINESS',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_role_role_id_key`(`role_id`),
    UNIQUE INDEX `sys_role_code_key`(`code`),
    INDEX `sys_role_role_type_status_idx`(`role_type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `type` ENUM('PAGE', 'BUTTON', 'API', 'MANAGEMENT', 'FIELD') NOT NULL DEFAULT 'API',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `method` VARCHAR(16) NULL,
    `path` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_permission_code_key`(`code`),
    INDEX `sys_permission_resource_action_idx`(`resource`, `action`),
    INDEX `sys_permission_type_status_idx`(`type`, `status`),
    INDEX `sys_permission_status_idx`(`status`),
    UNIQUE INDEX `sys_permission_method_path_key`(`method`, `path`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission_role_type` (
    `permission_id` CHAR(36) NOT NULL,
    `role_type` ENUM('BUSINESS', 'SYSTEM', 'SECURITY', 'AUDIT') NOT NULL,

    INDEX `sys_permission_role_type_role_type_permission_id_idx`(`role_type`, `permission_id`),
    PRIMARY KEY (`permission_id`, `role_type`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_data_resource` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `description` VARCHAR(255) NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_data_resource_code_key`(`code`),
    INDEX `sys_data_resource_status_code_idx`(`status`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_permission_field` (
    `id` CHAR(36) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `field` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `data_type` VARCHAR(32) NOT NULL,
    `relation_resource` VARCHAR(128) NULL,
    `relation_model` VARCHAR(128) NULL,
    `relation_field` VARCHAR(128) NULL,
    `risk_level` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `read_permission_id` CHAR(36) NOT NULL,
    `write_permission_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sys_permission_field_resource_status_idx`(`resource`, `status`),
    UNIQUE INDEX `sys_permission_field_resource_field_key`(`resource`, `field`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `route` VARCHAR(255) NOT NULL,
    `component` VARCHAR(255) NULL,
    `icon` VARCHAR(128) NULL,
    `route_props` JSON NULL,
    `node_type` ENUM('DIRECTORY', 'PAGE') NOT NULL DEFAULT 'PAGE',
    `parent_id` CHAR(36) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `permission_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_function_code_key`(`code`),
    UNIQUE INDEX `sys_function_route_key`(`route`),
    UNIQUE INDEX `sys_function_permission_id_key`(`permission_id`),
    INDEX `sys_function_parent_id_sort_idx`(`parent_id`, `sort`),
    INDEX `sys_function_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function_button` (
    `id` CHAR(36) NOT NULL,
    `function_id` CHAR(36) NOT NULL,
    `code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `label` VARCHAR(128) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `permission_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_function_button_code_key`(`code`),
    UNIQUE INDEX `sys_function_button_permission_id_key`(`permission_id`),
    INDEX `sys_function_button_function_id_sort_idx`(`function_id`, `sort`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_function_api` (
    `function_id` CHAR(36) NOT NULL,
    `api_id` CHAR(36) NOT NULL,
    `required` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`function_id`, `api_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_button_api` (
    `button_id` CHAR(36) NOT NULL,
    `api_id` CHAR(36) NOT NULL,

    PRIMARY KEY (`button_id`, `api_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_user_role` (
    `user_id` BIGINT UNSIGNED NOT NULL,
    `role_id` BIGINT UNSIGNED NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `granted_by` CHAR(36) NULL,
    `revoked_by` CHAR(36) NULL,
    `grant_reason` VARCHAR(255) NULL,
    `revoke_reason` VARCHAR(255) NULL,
    `approval_ref` CHAR(36) NULL,

    INDEX `sys_user_role_role_id_revoked_at_expires_at_idx`(`role_id`, `revoked_at`, `expires_at`),
    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_permission` (
    `role_id` BIGINT UNSIGNED NOT NULL,
    `permission_id` CHAR(36) NOT NULL,
    `assigned_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `granted_by` CHAR(36) NULL,
    `revoked_by` CHAR(36) NULL,
    `grant_reason` VARCHAR(255) NULL,
    `revoke_reason` VARCHAR(255) NULL,
    `approval_ref` CHAR(36) NULL,

    INDEX `sys_role_permission_permission_id_revoked_at_expires_at_idx`(`permission_id`, `revoked_at`, `expires_at`),
    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_data_scope` (
    `id` CHAR(36) NOT NULL,
    `role_id` BIGINT UNSIGNED NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `scope_type` ENUM('SELF', 'DEPARTMENT_SELF', 'DEPARTMENT_TREE', 'ORGANIZATION_SELF', 'ORGANIZATION_TREE', 'TENANT') NOT NULL,
    `expires_at` DATETIME(3) NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sys_role_data_scope_role_id_scope_type_revoked_at_expires_at_idx`(`role_id`, `scope_type`, `revoked_at`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_elevated_data_scope` (
    `id` CHAR(36) NOT NULL,
    `role_id` BIGINT UNSIGNED NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `scope_type` ENUM('CUSTOM', 'ALL') NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `approval_ref` CHAR(36) NOT NULL,
    `valid_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sys_role_elevated_data_scope_role_id_scope_type_revoked_at_e_idx`(`role_id`, `scope_type`, `revoked_at`, `expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_role_elevated_data_scope_target` (
    `id` CHAR(36) NOT NULL,
    `elevated_scope_id` CHAR(36) NOT NULL,
    `target_type` ENUM('USER', 'DEPARTMENT', 'ORGANIZATION', 'TENANT') NOT NULL,
    `target_id` CHAR(36) NOT NULL,
    `target_user_id` CHAR(36) NULL,
    `target_department_id` CHAR(36) NULL,
    `target_organization_id` CHAR(36) NULL,
    `target_tenant_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_role_elevated_data_scope_target_target_type_target_id_idx`(`target_type`, `target_id`),
    UNIQUE INDEX `sys_role_elevated_data_scope_target_elevated_scope_id_target_key`(`elevated_scope_id`, `target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_session` (
    `id` CHAR(64) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `kind` ENUM('PRE_AUTH', 'AUTHENTICATED') NOT NULL DEFAULT 'AUTHENTICATED',
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revoked_at` DATETIME(3) NULL,
    `mfa_verified_at` DATETIME(3) NULL,
    `reauthenticated_at` DATETIME(3) NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(512) NULL,

    INDEX `sys_session_user_id_revoked_at_idx`(`user_id`, `revoked_at`),
    INDEX `sys_session_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_audit_log` (
    `id` CHAR(36) NOT NULL,
    `trace_id` VARCHAR(64) NOT NULL,
    `actor_id` BIGINT UNSIGNED NULL,
    `action` VARCHAR(128) NOT NULL,
    `operation_code` VARCHAR(128) NULL,
    `risk_level` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L0',
    `resource` VARCHAR(128) NOT NULL,
    `method` VARCHAR(16) NOT NULL,
    `path` VARCHAR(512) NOT NULL,
    `result` ENUM('SUCCESS', 'FAILURE') NOT NULL,
    `status_code` INTEGER NOT NULL,
    `ip` VARCHAR(64) NULL,
    `user_agent` VARCHAR(512) NULL,
    `detail` JSON NULL,
    `integrity` CHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_audit_log_created_at_idx`(`created_at`),
    INDEX `sys_audit_log_actor_id_created_at_idx`(`actor_id`, `created_at`),
    INDEX `sys_audit_log_trace_id_idx`(`trace_id`),
    INDEX `sys_audit_log_risk_level_created_at_idx`(`risk_level`, `created_at`),
    INDEX `sys_audit_log_operation_code_created_at_idx`(`operation_code`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_operation_policy` (
    `id` CHAR(36) NOT NULL,
    `operation_code` VARCHAR(128) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `resource` VARCHAR(128) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `risk_level` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
    `min_risk_level` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L1',
    `require_mfa` BOOLEAN NOT NULL DEFAULT false,
    `require_reauth` BOOLEAN NOT NULL DEFAULT false,
    `require_approval` BOOLEAN NOT NULL DEFAULT false,
    `require_dual_control` BOOLEAN NOT NULL DEFAULT false,
    `audit_required` BOOLEAN NOT NULL DEFAULT true,
    `status` ENUM('DRAFT', 'PENDING', 'ACTIVE', 'DISABLED') NOT NULL DEFAULT 'DRAFT',
    `version` INTEGER NOT NULL DEFAULT 1,
    `reason` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_operation_policy_operation_code_key`(`operation_code`),
    INDEX `sys_operation_policy_status_risk_level_idx`(`status`, `risk_level`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_ops_ticket` (
    `id` CHAR(36) NOT NULL,
    `ticket_no` VARCHAR(32) NOT NULL,
    `type` ENUM('MFA_RESET_EMERGENCY', 'DB_MANUAL_FIX', 'PERMISSION_RECOVERY', 'ACCOUNT_RECOVERY', 'OTHER') NOT NULL,
    `status` ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'REJECTED', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `risk_level` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `reason` VARCHAR(1000) NOT NULL,
    `target_type` ENUM('USER', 'ROLE', 'PERMISSION', 'DATABASE', 'SYSTEM', 'OTHER') NOT NULL,
    `target_id` VARCHAR(128) NULL,
    `offline_basis` VARCHAR(1000) NOT NULL,
    `identity_verification` VARCHAR(500) NOT NULL,
    `offline_approver` VARCHAR(128) NOT NULL,
    `offline_reviewer` VARCHAR(128) NOT NULL,
    `external_ref` VARCHAR(128) NULL,
    `requested_by` CHAR(36) NOT NULL,
    `approved_by` CHAR(36) NULL,
    `executed_by` CHAR(36) NULL,
    `reviewed_by` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `approved_at` DATETIME(3) NULL,
    `executed_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,

    UNIQUE INDEX `sys_ops_ticket_ticket_no_key`(`ticket_no`),
    INDEX `sys_ops_ticket_status_created_at_idx`(`status`, `created_at`),
    INDEX `sys_ops_ticket_type_risk_level_created_at_idx`(`type`, `risk_level`, `created_at`),
    INDEX `sys_ops_ticket_requested_by_created_at_idx`(`requested_by`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_ops_ticket_evidence` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `type` ENUM('APPROVAL_SCREENSHOT', 'EMAIL', 'CHAT', 'SQL_REVIEW', 'OTHER') NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `uri` VARCHAR(1024) NOT NULL,
    `sha256` CHAR(64) NULL,
    `uploaded_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_ops_ticket_evidence_ticket_id_created_at_idx`(`ticket_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_ops_ticket_execution` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `ticket_no` VARCHAR(32) NOT NULL,
    `executor_user_id` CHAR(36) NULL,
    `operator_os_user` VARCHAR(128) NOT NULL,
    `operator_host` VARCHAR(255) NOT NULL,
    `operator_ip` VARCHAR(64) NULL,
    `db_current_user` VARCHAR(255) NOT NULL,
    `git_commit` VARCHAR(128) NULL,
    `script_name` VARCHAR(255) NOT NULL,
    `script_version` VARCHAR(128) NOT NULL,
    `command_hash` CHAR(64) NOT NULL,
    `dry_run` BOOLEAN NOT NULL DEFAULT false,
    `result` ENUM('SUCCESS', 'FAILED') NOT NULL,
    `before_snapshot` JSON NULL,
    `after_snapshot` JSON NULL,
    `trace_id` VARCHAR(64) NOT NULL,
    `signed_at` DATETIME(3) NULL,
    `execution_signature` CHAR(64) NULL,
    `executed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sys_ops_ticket_execution_ticket_id_executed_at_idx`(`ticket_id`, `executed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_tenant` (
    `id` CHAR(36) NOT NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_tenant_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_organization` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sys_organization_parent_id_tenant_id_idx`(`parent_id`, `tenant_id`),
    UNIQUE INDEX `sys_organization_id_tenant_id_key`(`id`, `tenant_id`),
    UNIQUE INDEX `sys_organization_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_department` (
    `id` CHAR(36) NOT NULL,
    `tenant_id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sys_department_parent_id_tenant_id_organization_id_idx`(`parent_id`, `tenant_id`, `organization_id`),
    INDEX `sys_department_organization_id_tenant_id_idx`(`organization_id`, `tenant_id`),
    UNIQUE INDEX `sys_department_id_tenant_id_key`(`id`, `tenant_id`),
    UNIQUE INDEX `sys_department_id_tenant_id_organization_id_key`(`id`, `tenant_id`, `organization_id`),
    UNIQUE INDEX `sys_department_tenant_id_code_key`(`tenant_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_approval_request` (
    `id` CHAR(36) NOT NULL,
    `request_no` VARCHAR(20) NOT NULL,
    `kind` ENUM('ROLE_GRANT', 'ROLE_STATUS', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL,
    `status` ENUM('REQUESTED', 'APPROVED', 'EXECUTED', 'REVIEWED', 'CANCELLED') NOT NULL DEFAULT 'REQUESTED',
    `payload` JSON NOT NULL,
    `reason` VARCHAR(255) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `applicant_id` CHAR(36) NOT NULL,
    `applicant_display_name` VARCHAR(128) NULL,
    `approver_id` CHAR(36) NULL,
    `approver_display_name` VARCHAR(128) NULL,
    `executor_id` CHAR(36) NULL,
    `executor_display_name` VARCHAR(128) NULL,
    `reviewer_id` CHAR(36) NULL,
    `reviewer_display_name` VARCHAR(128) NULL,
    `approved_at` DATETIME(3) NULL,
    `executed_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `approval_note` VARCHAR(255) NULL,
    `execution_note` VARCHAR(255) NULL,
    `review_note` VARCHAR(255) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `canceller_id` CHAR(36) NULL,
    `canceller_display_name` VARCHAR(128) NULL,
    `cancellation_note` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sys_approval_request_request_no_key`(`request_no`),
    INDEX `sys_approval_request_status_created_at_idx`(`status`, `created_at`),
    INDEX `sys_approval_request_applicant_id_created_at_idx`(`applicant_id`, `created_at`),
    INDEX `sys_approval_request_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sys_approval_target_ref` (
    `id` CHAR(36) NOT NULL,
    `token` CHAR(64) NOT NULL,
    `actor_user_id` CHAR(36) NOT NULL,
    `kind` ENUM('ROLE_GRANT', 'ROLE_STATUS', 'ROLE_PERMISSIONS', 'API_ROUTE_CHANGE', 'API_CREATE', 'API_UPDATE', 'API_ENABLE', 'API_DISABLE', 'API_DELETE', 'PAGE_ENABLE', 'PAGE_DISABLE', 'PAGE_ROUTE_CHANGE', 'ELEVATED_SCOPE', 'ROLE_REVOKE', 'ROLE_PERMISSION_REVOKE', 'ELEVATED_REVOKE', 'MFA_RESET') NOT NULL,
    `target_type` VARCHAR(16) NOT NULL,
    `target_id` CHAR(36) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sys_approval_target_ref_token_key`(`token`),
    INDEX `sys_approval_target_ref_actor_user_id_expires_at_idx`(`actor_user_id`, `expires_at`),
    INDEX `sys_approval_target_ref_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_organization_id_tenant_id_fkey` FOREIGN KEY (`organization_id`, `tenant_id`) REFERENCES `sys_organization`(`id`, `tenant_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_user` ADD CONSTRAINT `sys_user_department_id_tenant_id_organization_id_fkey` FOREIGN KEY (`department_id`, `tenant_id`, `organization_id`) REFERENCES `sys_department`(`id`, `tenant_id`, `organization_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `biz_order` ADD CONSTRAINT `biz_order_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `biz_order` ADD CONSTRAINT `biz_order_owner_id_fkey` FOREIGN KEY (`owner_id`) REFERENCES `sys_user`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_password_history` ADD CONSTRAINT `sys_password_history_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_permission_role_type` ADD CONSTRAINT `sys_permission_role_type_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `sys_permission`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_permission_field` ADD CONSTRAINT `sys_permission_field_read_permission_id_fkey` FOREIGN KEY (`read_permission_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_permission_field` ADD CONSTRAINT `sys_permission_field_write_permission_id_fkey` FOREIGN KEY (`write_permission_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function` ADD CONSTRAINT `sys_function_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `sys_function`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_function` ADD CONSTRAINT `sys_function_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_button` ADD CONSTRAINT `sys_function_button_function_id_fkey` FOREIGN KEY (`function_id`) REFERENCES `sys_function`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_button` ADD CONSTRAINT `sys_function_button_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_api` ADD CONSTRAINT `sys_function_api_function_id_fkey` FOREIGN KEY (`function_id`) REFERENCES `sys_function`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_function_api` ADD CONSTRAINT `sys_function_api_api_id_fkey` FOREIGN KEY (`api_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_button_api` ADD CONSTRAINT `sys_button_api_button_id_fkey` FOREIGN KEY (`button_id`) REFERENCES `sys_function_button`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_button_api` ADD CONSTRAINT `sys_button_api_api_id_fkey` FOREIGN KEY (`api_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_user_role` ADD CONSTRAINT `sys_user_role_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_permission` ADD CONSTRAINT `sys_role_permission_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `sys_permission`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_data_scope` ADD CONSTRAINT `sys_role_data_scope_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_data_scope` ADD CONSTRAINT `sys_role_data_scope_resource_fkey` FOREIGN KEY (`resource`) REFERENCES `sys_data_resource`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope` ADD CONSTRAINT `sys_role_elevated_data_scope_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `sys_role`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope` ADD CONSTRAINT `sys_role_elevated_data_scope_resource_fkey` FOREIGN KEY (`resource`) REFERENCES `sys_data_resource`(`code`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_target_user_id_fkey` FOREIGN KEY (`target_user_id`) REFERENCES `sys_user`(`user_id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_target_department_id_fkey` FOREIGN KEY (`target_department_id`) REFERENCES `sys_department`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_target_organization_id_fkey` FOREIGN KEY (`target_organization_id`) REFERENCES `sys_organization`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_target_tenant_id_fkey` FOREIGN KEY (`target_tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `sys_role_elevated_data_scope_target` ADD CONSTRAINT `sys_role_elevated_data_scope_target_elevated_scope_id_fkey` FOREIGN KEY (`elevated_scope_id`) REFERENCES `sys_role_elevated_data_scope`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_session` ADD CONSTRAINT `sys_session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `sys_user`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_audit_log` ADD CONSTRAINT `sys_audit_log_actor_id_fkey` FOREIGN KEY (`actor_id`) REFERENCES `sys_user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_ops_ticket_evidence` ADD CONSTRAINT `sys_ops_ticket_evidence_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `sys_ops_ticket`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_ops_ticket_execution` ADD CONSTRAINT `sys_ops_ticket_execution_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `sys_ops_ticket`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_organization` ADD CONSTRAINT `sys_organization_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_organization` ADD CONSTRAINT `sys_organization_parent_id_tenant_id_fkey` FOREIGN KEY (`parent_id`, `tenant_id`) REFERENCES `sys_organization`(`id`, `tenant_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_tenant_id_fkey` FOREIGN KEY (`tenant_id`) REFERENCES `sys_tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_organization_id_tenant_id_fkey` FOREIGN KEY (`organization_id`, `tenant_id`) REFERENCES `sys_organization`(`id`, `tenant_id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sys_department` ADD CONSTRAINT `sys_department_parent_id_tenant_id_organization_id_fkey` FOREIGN KEY (`parent_id`, `tenant_id`, `organization_id`) REFERENCES `sys_department`(`id`, `tenant_id`, `organization_id`) ON DELETE RESTRICT ON UPDATE CASCADE;
