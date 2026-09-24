-- Existing sessions are formal sessions. New login attempts explicitly use PRE_AUTH.
ALTER TABLE `sys_session`
  ADD COLUMN `kind` ENUM('PRE_AUTH', 'AUTHENTICATED') NOT NULL DEFAULT 'AUTHENTICATED' AFTER `userId`;

