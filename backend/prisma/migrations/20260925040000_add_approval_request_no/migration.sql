ALTER TABLE `sys_approval_request` ADD COLUMN `requestNo` VARCHAR(20) NULL;

UPDATE `sys_approval_request`
SET `requestNo` = CONCAT(
  DATE_FORMAT(`createdAt`, '%Y%m%d'),
  '-',
  UPPER(SUBSTRING(REPLACE(`id`, '-', ''), 1, 8))
)
WHERE `requestNo` IS NULL;

ALTER TABLE `sys_approval_request`
  MODIFY `requestNo` VARCHAR(20) NOT NULL;

CREATE UNIQUE INDEX `sys_approval_request_requestNo_key` ON `sys_approval_request`(`requestNo`);
