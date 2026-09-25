import Notification from 'element-ui/lib/notification.js'

export function notify(opts = {}) {
  const customClass = ['notification-with-linebreaks', opts.customClass].filter(Boolean).join(' ')
  return Notification({
    type: 'error',
    position: 'top-right',
    showClose: true,
    title: '操作提示',
    ...opts,
    customClass,
  })
}

export function notifyRequestError(error) {
  return notify({
    message: `错误信息：${error.message}\n请求标识：${error.traceId || '未提供'}`,
  })
}
