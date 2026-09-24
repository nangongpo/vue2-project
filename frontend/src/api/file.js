// 获取放在public目录下的文件
export function getLocalFile() {
  return ''
  // return path ? `${process.env.VUE_APP_PREFIX_PATH}${path}` : ''
}

// 远程文件
export function getRemoteFile(path) {
  return path
    ? `${import.meta.env.VITE_APP_PROXY_URL || ''}${import.meta.env.VITE_APP_BASE_API}/${path}`
    : ''
}
