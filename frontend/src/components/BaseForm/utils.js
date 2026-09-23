import { isValidValue, deepClone, getLabelByOptions } from '@/utils'

/**
 * 构造表单渲染值, 表单项配置中的options优先级高
 * @param {{ prop, formatValue, options, formatOptions }} item
 * @param {object} model
 * @param {object} parent
 * @returns {{ value, cellValue, curOptions, defaultValue }}
 */
export function getFormItemValue(item = {}, model = {}, parent = {}) {
  const { props = {} } = parent
  const { allOptions = {}, filterOptionBy, defaultValue } = props
  const { prop, render, formatValue, options, formatOptions } = item
  let curOptions = options || (formatOptions ? formatOptions(allOptions, model) : allOptions[prop])

  // 过滤选项无效值
  if (Array.isArray(curOptions) && filterOptionBy) {
    curOptions = curOptions.filter(v => Object.prototype.hasOwnProperty.call(v, filterOptionBy) ? v[filterOptionBy] : true)
  }
  let value = model[prop]
  // 转义值
  let cellValue = value
  // 有转义方法
  if (formatValue) {
    cellValue = value = formatValue(item, model, allOptions)
  } else {
    // 无render，需要转义
    if (!render) {
      cellValue = getLabelByOptions(value, curOptions) || defaultValue
    }
  }

  return { value, cellValue, options: curOptions, defaultValue }
}

// 获取组件基础属性
export function getComponentAttrs(obj) {
  // 排除下划线命名的字段
  const isIgnoreAttrs = (key) => {
    return key.indexOf('_') > -1 || ['label', 'render', 'formatValue', 'formatOptions'].includes(key)
  }
  return Object.keys(obj).reduce((acc, key) => {
    const value = obj[key]
    const isValidAttr = value !== null && !isIgnoreAttrs(key, value)
    return isValidAttr ? { ...acc, [key]: value } : acc
  }, {})
}

export function filterObjectNullValue(obj) {
  return Object.keys(obj).reduce((t, v) => {
    return obj[v] !== null ? { ...t, [v]: obj[v] } : t
  }, {})
}

/**
 * prop_width = 0 不设置宽度、prop_width = 1 独占一行
 * @param {object} item 表单项配置
 * @param {object} model 表单填充值
 * @param {number|string} propWidth 组件传递的默认表单项宽度
 * @returns {string}
 */
export function getFormItemWidth(item, model, propWidth = 0) {
  const { render, prop, disabled } = item
  let itemWidth
  if (typeof (propWidth) === 'string') return propWidth

  switch (propWidth) {
    case 0:
      if (render === 'image') {
        const value = model[prop]
        let imageNum = Array.isArray(value) ? value.length : value && value.indexOf(',') > -1 ? value.split(',').length : 1
        imageNum = disabled ? imageNum : imageNum + 1
        const imageWidth = 148
        itemWidth = `${(imageNum * imageWidth) + (imageNum - 1) * 10}px`
      }
      break
    case 1:
      itemWidth = '100%'
      break
    default:
      if (propWidth > 0 && propWidth < 1) {
        itemWidth = `${propWidth * 100}%`
      } else {
        itemWidth = `${propWidth}px`
      }
  }

  return itemWidth
}

/**
 * 初始化el-form的model, 只保留fields中涉及的prop
 * @param {array} fields 表单字段
 * @param {object} model 表单对象
 * @param {array} otherProps 扩充表单字段, 一般指接口需要的特殊字段
 * @returns {object}
 */
export function getDefaultModel(fields = [], model = {}, otherProps = []) {
  const defaultModel = otherProps.reduce((t, v) => {
    return { ...t, [v]: model[v] }
  }, {})
  const mapPropType = {
    string: '',
    array: []
  }
  const getDefaultValue = (item, model) => {
    const value = model[item.prop]
    return item.formatValue
      ? item.formatValue(item, model)
      : isValidValue(value)
        ? value
        : mapPropType[item.prop_type]
  }
  fields.map(item => {
    // 表单项隐藏时清除当前值
    if (item.prop && item.display !== false) {
      defaultModel[item.prop] = getDefaultValue(item, model)
    }
  })
  return defaultModel
}

/** 用于表格项数据转表单数据, 不调用formatValue */
export function getOriginModel(fields = [], model = {}, otherProps = []) {
  const defaultModel = otherProps.reduce((t, v) => {
    return { ...t, [v]: model[v] }
  }, {})
  const mapPropType = {
    string: '',
    array: []
  }
  const getDefaultValue = (item, model) => {
    const value = model[item.prop]
    return isValidValue(value) ? value : mapPropType[item.prop_type]
  }
  fields.map(item => {
    // 表单项隐藏时清除当前值
    if (item.prop && item.display !== false) {
      defaultModel[item.prop] = getDefaultValue(item, model)
    }
  })
  return defaultModel
}

// 单独构造表单el-form的rules
export function getDefaultRules(fields, rules = {}) {
  const defaultRules = {}
  fields.map(v => {
    const { prop, label, display, prop_type, required, placeholder } = v
    if (display && required) {
      const requiredRule = {
        type: prop_type,
        required,
        message: placeholder || `请填写${label}`
      }
      defaultRules[prop] = rules[prop] ? [requiredRule, rules[prop]] : [requiredRule]
    }
  })
  return defaultRules
}

/**
 * 格式化提交的参数, 通过读取配置项中的is_submit字段和检查有效值，过滤表单
 * @param {array} fields 表单字段
 * @param {object} model 表单对象
 * @param {object} otherModel 扩充表单对象
 * @returns {object}
 */
export function getSubmitFields(fields = [], model = {}, otherModel = {}) {
  const submitForm = deepClone(model)
  const getSubmitValue = (item, model) => {
    const value = model[item.prop]
    if (isValidValue(value)) {
      return item.formatValue ? item.formatValue(item, model) : value
    }
  }
  fields.map(item => {
    if (item.prop) {
      if (Object.prototype.hasOwnProperty.call(item, 'is_submit')) {
        submitForm[item.prop] = item.is_submit ? getSubmitValue(item, model) : undefined
      } else {
        submitForm[item.prop] = getSubmitValue(item, model)
      }
    }
  })

  return { ...submitForm, ...otherModel }
}
