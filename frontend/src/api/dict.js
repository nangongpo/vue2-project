import store from '@/store'
import { axiosPost } from '@/api'

// 格式化映射
export const formatOptions = (opts = [], mapOpts = { label: 'label', value: 'value' }) => {
  return opts.map(v => {
    return { ...v, label: v[mapOpts.label], value: v[mapOpts.value] }
  })
}

// 保存映射
const setOptions = (obj = {}) => store.commit('user/SET_BATCH_OPTIONS', obj)

/** 信号机列表 */
export function getTrafficSignalList() {
  return new Promise((resolve, reject) => {
    axiosPost('/devops/signal/list/').then(data => {
      const traffic_signal_id = (data || []).map(v => {
        return { label: `${v.seq} ${v.name}`, value: v.id, qy: v.qy }
      })
      setOptions({ traffic_signal_id })
      resolve(traffic_signal_id)
    }).catch(reject)
  })
}

/** 角色列表 */
export function getRoleList() {
  return new Promise((resolve, reject) => {
    axiosPost('/role/get_list/').then(data => {
      const role_info = formatOptions(data, { label: 'role_name', value: 'role_id' })
      setOptions({ role_info })
      resolve(role_info)
    }).catch(reject)
  })
}

/** 单位列表 */
export function getUnitList() {
  return new Promise((resolve, reject) => {
    axiosPost('/unit/get_list/').then(data => {
      const unit_info = formatOptions(data, { label: 'unit_name', value: 'id' })
      setOptions({ unit_info })
      resolve(unit_info)
    }).catch(reject)
  })
}

/** 所属单位，受unit_type控制 */
export function getUnitDict(opts, model) {
  const { unit_type } = model || {}
  const _opts = opts.unit_info || []
  return _opts.filter(v => v.unit_type === unit_type)
}

/** 上级单位列表 */
export function getParentUnitDict(opts, model) {
  const { unit_type } = model
  // 经销商、网点
  if (['3', '4'].includes(unit_type)) {
    return getUnitDict(opts, { unit_type: '2' })
  }
  // 协会分管单位
  if (unit_type === '2') {
    return getUnitDict(opts, { unit_type: '1' })
  }
  // 协会
  if (unit_type === '1') {
    return getUnitDict(opts, { unit_type: '0' })
  }
  return []
}

/** 单位管理 - 单位类型 */
export function getUnitTypeDict(opts) {
  return (opts.unit_type || []).filter(v => v.value <= '2')
}

/** 用户管理 - 用户类型 不能选择群众 */
export function getUserTypeDict(opts) {
  return (opts.user_type || []).filter(v => v.value !== '1')
}
