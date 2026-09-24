import { getAllMenu } from '@/router/auto-router'
import { getRequestUrlOptions } from './role'

export function getOptions() {
  const { menuList } = getAllMenu()
  return {
    request_url_label: getRequestUrlOptions(menuList),
    boolean: [
      // el-switch-option组件专用映射
      { label: '', value: true },
      { label: '', value: false },
    ],
    is_success: [
      { label: '成功', value: '1' },
      { label: '失败', value: '0' },
    ],
    yes_or_no: [
      { label: '是', value: true },
      { label: '否', value: false },
    ],
    is_normal: [
      { label: '正常', value: '1' },
      { label: '异常', value: '0' },
    ],
    reserved_flag: [
      { label: '可以预约', value: '1' },
      { label: '禁止预约', value: '2' },
    ],
    auto_flag: [
      { label: '开', value: '1' },
      { label: '关', value: '2' },
    ],
    // todo 漏洞整改 role_type 由后端返回
    role_type: [
      { label: '业务办理', value: 'business' },
      { label: '系统管理', value: 'system' },
      { label: '安全管理', value: 'security' },
      { label: '审计管理', value: 'audit' },
    ],
    upload_mode: [
      // 上传方式
      { label: '拍摄', value: 'camera' },
      { label: '从相册选择', value: 'album' },
    ],
    upload_type: [
      // 证据类型
      { label: '照片', value: 'img' },
      { label: '视频', value: 'video' },
    ],
    image_angle: [
      // 图片旋转角度
      { label: '正常', value: '0' },
      { label: '旋转180度', value: '180' },
      { label: '顺时针旋转90度', value: '270' },
      { label: '逆时针旋转90度', value: '90' },
    ],
    magnification: [
      { label: '放大2倍', value: 2 },
      { label: '放大4倍', value: 4 },
      { label: '放大6倍', value: 6 },
      { label: '放大8倍', value: 8 },
    ],
  }
}
