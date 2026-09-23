import { isValidValue, getLabelByOptions } from '@/utils'

/**
 * 构造单元格渲染值
 * @param {{ prop, formatValue, options, formatOptions }} item
 * @param {object} row
 * @param {object} parent
 * @returns {{ value, cellValue, curOptions, defaultValue }}
 */
export function getTableColumnValue(item = {}, row = {}, parent = {}) {
  const { props = {} } = parent
  const { allOptions = {}, defaultValue } = props
  const { prop, formatValue, options, formatOptions } = item
  const curOptions = options || (formatOptions ? formatOptions(allOptions, row) : allOptions[prop])

  let value = row[prop]
  let cellValue = value

  // 有转义函数
  if (formatValue) {
    cellValue = value = formatValue(item, row, allOptions)
  } else {
  // 有映射，需要转义
    if (curOptions) {
      cellValue = getLabelByOptions(value, curOptions)
      if (!isValidValue(cellValue)) {
        cellValue = defaultValue
      }
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

// 获取虚拟节点中的文本
export function getTextNode(vNode = {}) {
  const hasText = (arr) => arr.find(v => Boolean(v.text))
  const { text, children } = vNode
  if (text) return text
  const newText = hasText(children)
  if (newText) {
    return getTextNode(newText)
  }
}

// 判断字段列表
export function isNormalColumn(v) {
  return !!v.prop && !['selection', 'index', 'expand'].includes(v.type)
}

// 获取表格参数配置列表 [{ name: '我的', // 表示字段名 state: true, // 表示选择状态 disabled: true // 表示是否禁用 }]
export function getTableFieldData(h, fields = []) {
  const newFields = fields.map(item => {
    const { prop, label, display, editable } = item
    let newLabel = label
    // label为函数式，解析里面的文本
    if (typeof (label) === 'function') {
      const vNode = label(h, {})
      newLabel = getTextNode(vNode)
    }
    return { prop, name: newLabel, state: display, disabled: !editable }
  })
  return newFields
}

// 根据指定字段提取表格数据中的字段列表
export function getTableFieldByTableData(tableData = [], config = {}) {
  const { prop, label } = config
  return tableData.reduce((t, v) => {
    return v[prop] ? [...t, { prop, name: typeof (label) === 'function' ? label(v) : (v[label] || v[prop]), state: true, disabled: false, config: v }] : t
  }, [])
}

// 根据指定字段处理导出的数据
export function excel_data_format(tableFields = [], tableData = [], allOptions = {}, checkedField = []) {
  console.time('excel_data_format')
  const fieldMap = checkedField.length > 0
    ? tableFields.filter(v => checkedField.includes(v.prop))
    : tableFields.filter(v => isNormalColumn(v))

  // 构造excel字段
  const header = [], excelFieldsMap = {}, data = [], cacheOptionMap = {}
  for (let i = 0; i < fieldMap.length; i++) {
    const item = fieldMap[i]
    const { prop, formatOptions } = item
    item['options'] = formatOptions ? formatOptions(allOptions, item.options) : item.options || allOptions[prop]
    excelFieldsMap[prop] = item
    header.push(item.label)
  }

  for (let i = 0; i < tableData.length; i++) {
    const rowData = tableData[i]
    const labels = []
    for (let j = 0; j < fieldMap.length; j++) {
      const key = fieldMap[j].prop
      const { prop, options, formatValue } = excelFieldsMap[key]
      let value = rowData[prop]
      if (!isValidValue(value)) {
        labels.push(value || '')
        continue
      }
      if (formatValue) {
        value = formatValue(excelFieldsMap[key], rowData, allOptions)
        labels.push(value)
        continue
      }
      if (options) {
        const uuid = `${prop}-${value}`
        if (!cacheOptionMap[uuid]) {
          cacheOptionMap[uuid] = getLabelByOptions(value, options)
        }
        labels.push(cacheOptionMap[uuid])
      } else {
        labels.push(value)
      }
    }
    data.push(labels)
  }
  console.timeEnd('excel_data_format')
  return { data, header }
}
