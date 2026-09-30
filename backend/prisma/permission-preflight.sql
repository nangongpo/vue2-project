-- 现有数据库表结构完整性检查（只读）。
-- 本脚本不创建、删除、迁移或修改任何数据，只检查当前库是否符合初始化 schema。
-- 结果集应为空；出现记录即表示需要人工处理。

-- 1. 缺失的数据表。
SELECT expected.table_name AS missing_table
FROM (
  SELECT 'sys_user' AS table_name
  UNION ALL
  SELECT 'biz_order' AS table_name
  UNION ALL
  SELECT 'sys_password_history' AS table_name
  UNION ALL
  SELECT 'sys_role' AS table_name
  UNION ALL
  SELECT 'sys_permission' AS table_name
  UNION ALL
  SELECT 'sys_permission_role_type' AS table_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name
  UNION ALL
  SELECT 'sys_function' AS table_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name
  UNION ALL
  SELECT 'sys_function_api' AS table_name
  UNION ALL
  SELECT 'sys_button_api' AS table_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name
  UNION ALL
  SELECT 'sys_session' AS table_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name
  UNION ALL
  SELECT 'sys_organization' AS table_name
  UNION ALL
  SELECT 'sys_department' AS table_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name
) AS expected
LEFT JOIN information_schema.tables AS actual
  ON actual.table_schema = DATABASE()
 AND actual.table_name = expected.table_name
 AND actual.table_type = 'BASE TABLE'
WHERE actual.table_name IS NULL;

-- 2. 缺失的物理列。
SELECT expected.table_name, expected.column_name AS missing_column
FROM (
  SELECT 'sys_user' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'user_id' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'username' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'password' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'password_changed_at' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'display_name' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'failed_logins' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'locked_until' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'last_login_at' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'last_login_ip' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'mfa_secret' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'mfa_enabled' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'mfa_last_step' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'tenant_id' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'department_id' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'organization_id' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_user' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'order_id' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'order_no' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'tenant_id' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'owner_id' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'department_id' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'organization_id' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'customer_name' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'total_amount' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'currency' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'remark' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'created_by' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'biz_order' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_password_history' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_password_history' AS table_name, 'user_id' AS column_name
  UNION ALL
  SELECT 'sys_password_history' AS table_name, 'password' AS column_name
  UNION ALL
  SELECT 'sys_password_history' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'role_id' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'description' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'role_type' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_role' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'resource' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'action' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'type' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'method' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'path' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_permission' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_permission_role_type' AS table_name, 'permission_id' AS column_name
  UNION ALL
  SELECT 'sys_permission_role_type' AS table_name, 'role_type' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'description' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'resource' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'field' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'data_type' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'relation_resource' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'relation_model' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'relation_field' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'risk_level' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'read_permission_id' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'write_permission_id' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'route' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'component' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'icon' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'route_props' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'node_type' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'parent_id' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'sort' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'permission_id' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_function' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'function_id' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'label' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'sort' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'permission_id' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_function_api' AS table_name, 'function_id' AS column_name
  UNION ALL
  SELECT 'sys_function_api' AS table_name, 'api_id' AS column_name
  UNION ALL
  SELECT 'sys_function_api' AS table_name, 'required' AS column_name
  UNION ALL
  SELECT 'sys_button_api' AS table_name, 'button_id' AS column_name
  UNION ALL
  SELECT 'sys_button_api' AS table_name, 'api_id' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'user_id' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'role_id' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'assigned_at' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'revoked_at' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'granted_by' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'revoked_by' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'grant_reason' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'revoke_reason' AS column_name
  UNION ALL
  SELECT 'sys_user_role' AS table_name, 'approval_ref' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'role_id' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'permission_id' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'assigned_at' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'revoked_at' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'granted_by' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'revoked_by' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'grant_reason' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'revoke_reason' AS column_name
  UNION ALL
  SELECT 'sys_role_permission' AS table_name, 'approval_ref' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'role_id' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'resource' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'scope_type' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'revoked_at' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'role_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'resource' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'scope_type' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'reason' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'approval_ref' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'valid_from' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'revoked_at' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'elevated_scope_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'target_type' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'target_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'target_user_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'target_department_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'target_organization_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'target_tenant_id' AS column_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope_target' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'user_id' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'kind' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'last_seen_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'revoked_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'mfa_verified_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'reauthenticated_at' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'ip' AS column_name
  UNION ALL
  SELECT 'sys_session' AS table_name, 'user_agent' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'trace_id' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'actor_id' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'action' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'operation_code' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'risk_level' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'resource' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'method' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'path' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'result' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'status_code' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'ip' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'user_agent' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'detail' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'integrity' AS column_name
  UNION ALL
  SELECT 'sys_audit_log' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'operation_code' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'resource' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'action' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'risk_level' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'min_risk_level' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'require_mfa' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'require_reauth' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'require_approval' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'require_dual_control' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'audit_required' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'version' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'reason' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'ticket_no' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'type' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'risk_level' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'title' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'reason' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'target_type' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'target_id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'offline_basis' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'identity_verification' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'offline_approver' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'offline_reviewer' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'external_ref' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'requested_by' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'approved_by' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'executed_by' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'reviewed_by' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'approved_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'executed_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'reviewed_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name, 'closed_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'ticket_id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'type' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'uri' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'sha256' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'uploaded_by' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_evidence' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'ticket_id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'ticket_no' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'executor_user_id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'operator_os_user' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'operator_host' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'operator_ip' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'db_current_user' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'git_commit' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'script_name' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'script_version' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'command_hash' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'dry_run' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'result' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'before_snapshot' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'after_snapshot' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'trace_id' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'signed_at' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'execution_signature' AS column_name
  UNION ALL
  SELECT 'sys_ops_ticket_execution' AS table_name, 'executed_at' AS column_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'tenant_id' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'parent_id' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_organization' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'tenant_id' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'organization_id' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'parent_id' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'code' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'name' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_department' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'request_no' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'kind' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'status' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'payload' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'reason' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'applicant_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'applicant_display_name' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'approver_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'approver_display_name' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'executor_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'executor_display_name' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'reviewer_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'reviewer_display_name' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'approved_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'executed_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'reviewed_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'approval_note' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'execution_note' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'review_note' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'cancelled_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'canceller_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'canceller_display_name' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'cancellation_note' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'created_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name, 'updated_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'id' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'token' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'actor_user_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'kind' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'target_type' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'target_id' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'expires_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'used_at' AS column_name
  UNION ALL
  SELECT 'sys_approval_target_ref' AS table_name, 'created_at' AS column_name
) AS expected
LEFT JOIN information_schema.columns AS actual
  ON actual.table_schema = DATABASE()
 AND actual.table_name = expected.table_name
 AND actual.column_name = expected.column_name
WHERE actual.column_name IS NULL;

-- 3. 不允许出现驼峰物理列。
SELECT table_name, column_name AS camel_case_column
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND column_name COLLATE utf8_bin REGEXP '[A-Z]';

-- 4. 需要维护更新时间的表不得缺少 updated_at。
SELECT expected.table_name AS missing_updated_at
FROM (
  SELECT 'sys_user' AS table_name
  UNION ALL
  SELECT 'biz_order' AS table_name
  UNION ALL
  SELECT 'sys_role' AS table_name
  UNION ALL
  SELECT 'sys_permission' AS table_name
  UNION ALL
  SELECT 'sys_data_resource' AS table_name
  UNION ALL
  SELECT 'sys_permission_field' AS table_name
  UNION ALL
  SELECT 'sys_function' AS table_name
  UNION ALL
  SELECT 'sys_function_button' AS table_name
  UNION ALL
  SELECT 'sys_role_data_scope' AS table_name
  UNION ALL
  SELECT 'sys_role_elevated_data_scope' AS table_name
  UNION ALL
  SELECT 'sys_operation_policy' AS table_name
  UNION ALL
  SELECT 'sys_ops_ticket' AS table_name
  UNION ALL
  SELECT 'sys_tenant' AS table_name
  UNION ALL
  SELECT 'sys_organization' AS table_name
  UNION ALL
  SELECT 'sys_department' AS table_name
  UNION ALL
  SELECT 'sys_approval_request' AS table_name
) AS expected
LEFT JOIN information_schema.columns AS actual
  ON actual.table_schema = DATABASE()
 AND actual.table_name = expected.table_name
 AND actual.column_name = 'updated_at'
WHERE actual.column_name IS NULL;
