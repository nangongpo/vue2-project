-- Store the risk level that was effective when an audit event occurred.
ALTER TABLE `sys_audit_log`
  ADD COLUMN `riskLevel` ENUM('L0', 'L1', 'L2', 'L3') NOT NULL DEFAULT 'L0' AFTER `action`;

CREATE INDEX `sys_audit_log_riskLevel_createdAt_idx`
  ON `sys_audit_log` (`riskLevel`, `createdAt`);
