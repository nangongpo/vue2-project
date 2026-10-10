-- 数据库初始化后的通用只读预检。
--
-- 本脚本不读取业务数据，不创建、删除、迁移或修改任何数据。
-- 每个结果集都应为空；结果集有记录时，仅表示数据库存在通用结构问题。
-- 本脚本和 verify-permission-migration.js 只检查数据库元数据完整性，
-- 不维护应用表、字段或业务模块清单。

-- 1. Prisma migration 不得存在未完成或已回滚记录。
SELECT migration_name, started_at, finished_at, rolled_back_at
FROM `_prisma_migrations`
WHERE finished_at IS NULL
   OR rolled_back_at IS NOT NULL;

-- 2. 基础表必须有主键。
SELECT tables.table_name
FROM information_schema.tables AS tables
LEFT JOIN information_schema.table_constraints AS pk
  ON pk.table_schema = tables.table_schema
 AND pk.table_name = tables.table_name
 AND pk.constraint_type = 'PRIMARY KEY'
WHERE tables.table_schema = DATABASE()
  AND tables.table_type = 'BASE TABLE'
  AND pk.table_name IS NULL;

-- 3. 物理表名、列名和索引名不应使用驼峰或超长标识符。
SELECT 'COLUMN' AS object_type, table_name, column_name AS object_name
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND (column_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(column_name) > 64)
UNION ALL
SELECT 'INDEX' AS object_type, table_name, index_name AS object_name
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND (index_name COLLATE utf8_bin REGEXP '[A-Z]' OR CHAR_LENGTH(index_name) > 64);

-- 4. 外键必须引用当前数据库中存在的表和列。
SELECT constraint_name, table_name, column_name, referenced_table_name, referenced_column_name
FROM information_schema.key_column_usage AS kcu
WHERE table_schema = DATABASE()
  AND referenced_table_name IS NOT NULL
  AND (
    referenced_table_name NOT IN (
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
    )
    OR NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = kcu.referenced_table_name
        AND column_name = kcu.referenced_column_name
    )
  );
