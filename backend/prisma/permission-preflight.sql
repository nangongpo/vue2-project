-- Read-only checks before applying the permission-security migration.
-- Every result set must be empty; resolve collisions explicitly, never auto-delete records.
SELECT route, COUNT(*) AS duplicate_count FROM sys_function GROUP BY route HAVING COUNT(*) > 1;
SELECT method, path, COUNT(*) AS duplicate_count FROM sys_permission
WHERE method IS NOT NULL AND path IS NOT NULL GROUP BY method, path HAVING COUNT(*) > 1;
SELECT old.code AS old_code, replacement.code AS conflicting_code
FROM sys_permission old JOIN sys_permission replacement
ON replacement.code = CONCAT('system.', REPLACE(old.code, ':', '.'))
WHERE old.code IN ('user:read','user:create','user:update','user:reset-password','role:read','role:create','role:update','role:delete','audit:read','audit:detail');
SELECT id, code, method, path FROM sys_permission
WHERE type = 'API' AND code NOT IN ('*', 'system.permission.manage')
AND (method IS NULL OR method NOT IN ('GET','POST','PUT','PATCH','DELETE') OR path IS NULL);
