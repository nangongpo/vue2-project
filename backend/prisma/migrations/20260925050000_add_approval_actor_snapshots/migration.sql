ALTER TABLE `sys_approval_request`
  ADD COLUMN `applicantDisplayName` VARCHAR(128) NULL,
  ADD COLUMN `approverDisplayName` VARCHAR(128) NULL,
  ADD COLUMN `executorDisplayName` VARCHAR(128) NULL,
  ADD COLUMN `reviewerDisplayName` VARCHAR(128) NULL;

UPDATE `sys_approval_request` AS ar
LEFT JOIN `sys_user` AS u1 ON u1.`userId` = ar.`applicantId`
LEFT JOIN `sys_user` AS u2 ON u2.`userId` = ar.`approverId`
LEFT JOIN `sys_user` AS u3 ON u3.`userId` = ar.`executorId`
LEFT JOIN `sys_user` AS u4 ON u4.`userId` = ar.`reviewerId`
SET
  ar.`applicantDisplayName` = u1.`displayName`,
  ar.`approverDisplayName` = u2.`displayName`,
  ar.`executorDisplayName` = u3.`displayName`,
  ar.`reviewerDisplayName` = u4.`displayName`;
