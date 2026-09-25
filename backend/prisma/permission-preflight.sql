-- 权限安全迁移前置检查（只读）。
--
-- 使用方式：
--   mysql --defaults-extra-file=... database_name < backend/prisma/permission-preflight.sql
--
-- 约定：以下每个结果集都应该为空。脚本只报告问题，不自动删除、修改或回收数据。

-- 1. 页面路由必须唯一。
SELECT route, COUNT(*) AS duplicate_count
FROM sys_function
GROUP BY route
HAVING COUNT(*) > 1;

-- 2. API 的 method/path 必须唯一；NULL 值由后续结构检查处理。
SELECT method, path, COUNT(*) AS duplicate_count
FROM sys_permission
WHERE method IS NOT NULL AND path IS NOT NULL
GROUP BY method, path
HAVING COUNT(*) > 1;

-- 3. 旧权限码迁移时不能与目标权限码冲突。
SELECT legacy.code AS old_code, replacement.code AS conflicting_code
FROM sys_permission AS legacy
JOIN sys_permission AS replacement
  ON replacement.code = CONCAT('system.', REPLACE(legacy.code, ':', '.'))
WHERE legacy.code IN (
  'user:read', 'user:create', 'user:update', 'user:reset-password',
  'role:read', 'role:create', 'role:update', 'role:delete',
  'audit:read', 'audit:detail'
);

-- 4. API 权限必须使用受支持的方法和明确的 /api/v1 路径。
SELECT id, code, method, path
FROM sys_permission
WHERE type = 'API'
  AND code NOT IN ('*', 'system.permission.manage')
  AND (
    method IS NULL
    OR method NOT IN ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')
    OR path IS NULL
    OR path NOT LIKE '/api/v1/%'
    OR path LIKE '%*%'
  );

-- 5. 非 API 权限不应残留 HTTP 方法或路径。
SELECT id, code, type, method, path
FROM sys_permission
WHERE type <> 'API' AND (method IS NOT NULL OR path IS NOT NULL);

-- 6. 页面必须绑定同名 PAGE 权限，避免前端菜单与权限定义错位。
SELECT f.id AS function_id, f.code, f.route, f.permissionId, p.code AS permission_code, p.type
FROM sys_function AS f
LEFT JOIN sys_permission AS p ON p.id = f.permissionId
WHERE f.permissionId IS NULL
   OR p.id IS NULL
   OR p.type <> 'PAGE'
   OR p.code <> f.code
   OR p.resource <> f.route;

-- 7. 按钮必须绑定同名 BUTTON 权限，并且归属于有效页面。
SELECT b.id AS button_id, b.code, b.functionId, b.permissionId, p.code AS permission_code, f.status AS function_status
FROM sys_function_button AS b
LEFT JOIN sys_permission AS p ON p.id = b.permissionId
LEFT JOIN sys_function AS f ON f.id = b.functionId
WHERE b.permissionId IS NULL
   OR p.id IS NULL
   OR p.type <> 'BUTTON'
   OR p.code <> b.code
   OR f.id IS NULL;

-- 8. 页面只能直接绑定 GET API；写 API 必须通过按钮绑定。
SELECT f.code AS function_code, p.code AS api_code, p.method, p.path
FROM sys_function_api AS fa
JOIN sys_function AS f ON f.id = fa.functionId
JOIN sys_permission AS p ON p.id = fa.apiId
WHERE p.type <> 'API' OR p.method <> 'GET';

-- 9. 页面/API 和按钮/API 绑定必须指向启用的 API 权限。
SELECT 'function_api' AS binding_type, fa.functionId AS owner_id, fa.apiId, p.code, p.type, p.status
FROM sys_function_api AS fa
JOIN sys_permission AS p ON p.id = fa.apiId
WHERE p.type <> 'API' OR p.status <> 'ACTIVE'
UNION ALL
SELECT 'button_api' AS binding_type, ba.buttonId AS owner_id, ba.apiId, p.code, p.type, p.status
FROM sys_button_api AS ba
JOIN sys_permission AS p ON p.id = ba.apiId
WHERE p.type <> 'API' OR p.status <> 'ACTIVE';

-- 10. 已启用的按钮不能挂在已停用的页面下。
SELECT b.id AS button_id, b.code, f.id AS function_id, f.code AS function_code
FROM sys_function_button AS b
JOIN sys_function AS f ON f.id = b.functionId
WHERE b.status = 'ACTIVE' AND f.status <> 'ACTIVE';

-- 11. 角色权限绑定必须指向启用权限；撤销记录不参与检查。
SELECT r.code AS role_code, r.roleType, p.code AS permission_code, p.status
FROM sys_role_permission AS rp
JOIN sys_role AS r ON r.id = rp.roleId
JOIN sys_permission AS p ON p.id = rp.permissionId
WHERE rp.revokedAt IS NULL AND p.status <> 'ACTIVE';

-- 12. 角色类型与管理权限职责必须一致。
-- 共享审批查询和跨 SECURITY/SYSTEM 的运维读取是明确例外。
SELECT r.code AS role_code, r.roleType, p.code AS permission_code, p.requiredRoleType
FROM sys_role_permission AS rp
JOIN sys_role AS r ON r.id = rp.roleId
JOIN sys_permission AS p ON p.id = rp.permissionId
WHERE rp.revokedAt IS NULL
  AND r.roleType <> p.requiredRoleType
  AND p.code NOT IN (
    'system.approval.read', 'system.approval.detail', 'page.system.approval',
    'system.ops-ticket.read', 'system.ops-ticket.detail'
  )
  AND NOT (
    p.code IN (
      'system.ops-ticket.create', 'system.ops-ticket.update',
      'system.ops-ticket.submit', 'system.ops-ticket.approve',
      'system.ops-ticket.execute', 'system.ops-ticket.cancel',
      'system.ops-ticket.evidence', 'system.ops-ticket.executions'
    )
    AND r.roleType IN ('SECURITY', 'SYSTEM')
  );

-- 13. 同一有效账户不能同时拥有多个高危管理员职责。
SELECT u.userId, u.username,
       COUNT(DISTINCT r.roleType) AS admin_role_type_count,
       GROUP_CONCAT(DISTINCT r.roleType ORDER BY r.roleType) AS admin_role_types
FROM sys_user AS u
JOIN sys_user_role AS ur ON ur.userId = u.id AND ur.revokedAt IS NULL
JOIN sys_role AS r ON r.id = ur.roleId AND r.status = 'ACTIVE'
WHERE u.status = 'ACTIVE' AND r.roleType <> 'BUSINESS'
GROUP BY u.id, u.userId, u.username
HAVING COUNT(DISTINCT r.roleType) > 1;

-- 14. 管理员账号必须绑定 MFA；普通业务账号不纳入此检查。
SELECT u.userId, u.username, r.roleType, u.mfaEnabled
FROM sys_user AS u
JOIN sys_user_role AS ur ON ur.userId = u.id AND ur.revokedAt IS NULL
JOIN sys_role AS r ON r.id = ur.roleId AND r.status = 'ACTIVE'
WHERE u.status = 'ACTIVE'
  AND r.roleType <> 'BUSINESS'
  AND u.mfaEnabled <> 1;

-- 15. 角色、权限、页面和按钮编码不应包含非法通配符或空白。
SELECT 'role' AS object_type, CAST(id AS CHAR) AS object_id, code
FROM sys_role
WHERE code LIKE '%*%' OR code <> TRIM(code) OR code = ''
UNION ALL
SELECT 'permission' AS object_type, id AS object_id, code
FROM sys_permission
WHERE code LIKE '%*%' AND code NOT IN ('*', 'system.permission.manage')
UNION ALL
SELECT 'function' AS object_type, id AS object_id, code
FROM sys_function
WHERE code LIKE '%*%' OR code <> TRIM(code) OR code = ''
UNION ALL
SELECT 'button' AS object_type, id AS object_id, code
FROM sys_function_button
WHERE code LIKE '%*%' OR code <> TRIM(code) OR code = '';
