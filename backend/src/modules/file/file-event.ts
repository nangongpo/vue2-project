/**
 * 上传聚合的事件版本必须是有限、递增的业务版本，不能使用时间戳。
 * 版本用于客户端丢包后的顺序判断，数据库字段为 UNSIGNED INT。
 */
export const UPLOAD_EVENT_VERSION = {
  FINALIZING: 1,
  ABORTED: 1,
  SCANNING: 2,
  COMPLETED: 3,
  FAILED: 3,
} as const
