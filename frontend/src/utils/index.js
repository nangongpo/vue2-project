export function isNotEmpty(value) {
  return value !== undefined && value !== null && value !== ''
}

/**
 * 检测有效值的通用方法， 排除 '', null、undefined、[]、[undefined]、[null]、[''] 的情况
 * @param {*} value
 * @returns {Boolean}
 */
export function isValidValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every(v => isNotEmpty(v))
  }
  return isNotEmpty(value)
}

/** 请求参数格式化 */
export function formatParams(obj) {
  if (!obj) return
  const tmpObj = {}
  for (const key in obj) {
    if (isValidValue(obj[key])) {
      tmpObj[key] = obj[key]
    }
  }
  return tmpObj
}

/**
 * 文件下载
 * @param {string} url 完整链接
 */
export function downloadFile(url, filename) {
  const a = document.createElement('a')
  a.href = url
  a.download = filename || ''
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/**
 * 检验数据类型
 * @param {*} data
 * @param {String} type
 * @returns {String|Boolean}
 */
export function checkType(data, type) {
  const dataType = Object.prototype.toString
    .call(data)
    .slice(8, -1)
    .toLowerCase()
  return type ? dataType === type.toLowerCase() : dataType
}

/**
 * JSON字符串
 * @param {String} str
 * @returns {Boolean}
 */
export function isJSON(str) {
  if (typeof str !== 'string') {
    return false
  }
  try {
    JSON.parse(str)
    return true
  } catch (error) {
    return false
  }
}

/**
 * 首字母大写
 * @param {String} str
 * @returns {String}
 */
export function upperFirst(str) {
  if (!str) return ''
  return str.slice(0, 1).toUpperCase() + str.slice(1)
}

/**
 * 中横线命名改驼峰命名
 * @param {String} str
 * @returns {String}
 */
export function camelCase(str) {
  if (!str) return ''
  const s = str
    .match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
    .map((x) => x.slice(0, 1).toUpperCase() + x.slice(1).toLowerCase())
    .join('')
  return s.slice(0, 1).toLowerCase() + s.slice(1)
}

/**
 * 根据 precision（精度） 向下舍入 number
 * @param {Number} number
 * @param {Number} [precision=0]
 * @returns {Number}
 */
export function floor(number, precision = 0) {
  if (typeof number !== 'number' || typeof precision !== 'number') {
    throw new TypeError('Both arguments must be numbers')
  }
  if (precision) {
    const shift = 10 ** precision
    return Math.floor(number * shift) / shift
  }
  return Math.floor(number)
}

// *.jsx使用
export function renderError(h, err) {
  return h('pre', { style: { color: 'red' } }, err.stack)
}

/**
 * 数字转px的通用规则
 * @param {Number} num
 * @returns {String}
 */
export function numberToPx(num = 0) {
  if (typeof num !== 'number') return num
  if (num === 0) return undefined
  if (num === 1) return '100%'
  return num > 0 && num < 1 ? `${num * 100}%` : `${num}px`
}

/**
 * 通用转义方法
 * @param {string|array} value 转义值
 * @param {array} options 映射关系
 * @param {string|boolean} separator 拼接符, 为true时, 默认拼接逗号，为false不拼接, 其他情况直接作为拼接符
 * @returns {string|array}
 */
export function getLabelByOptions(value, options, separator = ',') {
  if (!isValidValue(value)) return
  if (!Array.isArray(options)) return value
  const optionMap = flattenOptions(options)
  const values = Array.isArray(value) ? value : [value]
  const newValue = values.filter(v => isValidValue(v)).map((val) => optionMap.get(val) || val)

  if (separator) {
    const _separator = typeof separator === 'boolean' ? ',' : separator
    return isValidValue(newValue)
      ? newValue.join(_separator)
      : values.join(_separator)
  }
  return isValidValue(newValue) ? newValue : values
}

function flattenOptions(options) {
  const optionMap = new Map()

  function flattenAndMap(options) {
    options.forEach((option) => {
      optionMap.set(option.value, option.label)
      if (option.children) {
        flattenAndMap(option.children)
      }
    })
  }

  flattenAndMap(options)

  return optionMap
}

/**
 * setTimeout倒计时, 时间间隔稳定, 提供清除定时器的方法clear
 * @param {Function} cb
 * @param {Number} second // 倒计时秒数 或 毫秒数(需要设置isMilliSecond = true), 后端返回10位的时间戳(其实就是秒数，直接传参就行)
 * @param {Object} options { immediate： 立即执行cb,  isMilliSecond: 是毫秒 }
 * @returns {{ clear: Function }}
 */
export function countDown(cb, second = 0, options = {}) {
  const { immediate = true, isMilliSecond = false } = options
  let s = isMilliSecond ? Math.floor(second / 1000) : second
  let timer

  const clear = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
  }

  const countdownStep = () => {
    if (s > 0) {
      s--
      cb && cb(s)
      timer = setTimeout(countdownStep, 1000)
    } else {
      clear()
    }
  }

  if (immediate) {
    cb && cb(s)
  }

  timer = setTimeout(countdownStep, 1000)

  return {
    clear
  }
}

/**
 * 请求参数转对象
 * @param {String} url
 * @returns {Object}
 */
export function getQueryObject(url = window.location.href) {
  return Object.fromEntries(new URL(url).searchParams)
}

/**
 * 对象转请求参数
 * @param {object} obj
 * @returns {string}
 */
export function getQueryParam(obj) {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(obj)) {
    if (isValidValue(value)) {
      searchParams.set(key, value)
    }
  }
  return searchParams.toString()
}

/**
 * 计算UTF-8字符串的字节长度
 * @param {String} input value
 * @returns {Number} output value
 */
export function byteLength(str) {
  if (!str) return 0
  let length = 0
  const strLength = str.length
  for (let i = 0; i < strLength; i++) {
    const code = str.charCodeAt(i)
    // Calculate the byte length based on UTF-8 encoding rules
    length += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4
    // Handle surrogate pairs for UTF-16
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = str.charCodeAt(i + 1)
      // Check if the next code point is a low surrogate
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        // Skip the next code point, as it's part of a surrogate pair
        i++
      }
    }
  }
  return length
}

/**
 * 去抖动
 * @param {Function} func - The function to debounce.
 * @param {Number} wait - The number of milliseconds to delay
 * @param {Boolean} immediate [immediate=false] - If `true`, the function is invoked immediately
 *                                      on the leading edge instead of the trailing edge.
 * @return {Function} A debounced version of the provided function.
 */
export function debounce(func, wait, immediate = false) {
  let timeout, result

  const debounced = function (...args) {
    const context = this

    const later = function () {
      timeout = null
      if (!immediate) {
        result = func.apply(context, args)
      }
    }

    const callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)

    if (callNow) {
      result = func.apply(context, args)
    }

    return result
  }
  /**
   * Cancels the debounced function's pending invocation.
   */
  debounced.cancel = function () {
    clearTimeout(timeout)
    timeout = null
  }

  return debounced
}

/**
 * This is just a simple version of deep copy
 * Has a lot of edge cases bug
 * If you want to use a perfect deep copy, use lodash's _.cloneDeep
 * @param {Object} source
 * @returns {Object}
 */
export function deepClone(source) {
  if (!source || typeof source !== 'object') {
    throw new Error('Invalid argument for deepClone')
  }
  const targetObj = Array.isArray(source) ? [] : {}
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      targetObj[key] =
        source[key] && typeof source[key] === 'object'
          ? deepClone(source[key])
          : source[key]
    }
  }
  return targetObj
}

/**
 * 获取虚拟节点中的文本
 * @param {VNode} vNode
 * @returns {String}
 */
export function getTextNode(vNode = {}) {
  const { text, children } = vNode
  if (text) {
    return text
  }
  const hasText = (arr) => arr.find((v) => v && v.text)
  const newText = hasText(children)

  return newText ? getTextNode(newText) : undefined
}

/**
 * 文本添加换行符
 * @param {string} value
 * @param {number} length
 */
export function textWrap(inputString, interval) {
  if (typeof inputString !== 'string') {
    return inputString
  }
  const resultArray = []
  for (let i = 0; i < inputString.length; i += interval) {
    resultArray.push(inputString.slice(i, i + interval))
  }
  return resultArray.join('\n').trimEnd()
}

/**
 * @param {Array} arr
 * @returns {Array}
 */
export function uniqueArr(arr) {
  return Array.from(new Set(arr))
}

/**
 * Number formatting
 * like 10000 => 10k
 * @param {number} num
 * @param {number} digits
 */
export function numberFormatter(num, digits) {
  const si = [
    { value: 1E18, symbol: 'E' },
    { value: 1E15, symbol: 'P' },
    { value: 1E12, symbol: 'T' },
    { value: 1E9, symbol: 'G' },
    { value: 1E6, symbol: 'M' },
    { value: 1E3, symbol: 'k' }
  ]
  for (let i = 0; i < si.length; i++) {
    if (num >= si[i].value) {
      return (num / si[i].value).toFixed(digits).replace(/\.0+$|(\.[0-9]*[1-9])0+$/, '$1') + si[i].symbol
    }
  }
  return num.toString()
}

/**
 * 10000 => "10,000"
 * @param {number} num
 */
export function toThousandFilter(num) {
  return (+num || 0).toString().replace(/^-?\d+/g, m => m.replace(/(?=(?!\b)(\d{3})+$)/g, ','))
}

/**
 * @param {HTMLElement} element
 * @param {String} className
 */
export function toggleClass(element, className) {
  if (!element || !className) {
    return
  }
  let classString = element.className
  const nameIndex = classString.indexOf(className)
  if (nameIndex === -1) {
    classString += '' + className
  } else {
    classString =
      classString.slice(0, nameIndex) +
      classString.slice(nameIndex + className.length)
  }
  element.className = classString
}

/**
 * Check if an element has a class
 * @param {HTMLElement} elm
 * @param {String} cls
 * @returns {Boolean}
 */
export function hasClass(ele, cls) {
  return !!ele.className.match(new RegExp('(\\s|^)' + cls + '(\\s|$)'))
}

/**
 * Add class to element
 * @param {HTMLElement} elm
 * @param {String} cls
 */
export function addClass(ele, cls) {
  if (!hasClass(ele, cls)) ele.className += ' ' + cls
}

/**
 * Remove class from element
 * @param {HTMLElement} elm
 * @param {String} cls
 */
export function removeClass(ele, cls) {
  if (hasClass(ele, cls)) {
    const reg = new RegExp('(\\s|^)' + cls + '(\\s|$)')
    ele.className = ele.className.replace(reg, ' ')
  }
}

/**
 * 是外部链接?
 * @param {String} path
 * @returns {Boolean}
 */
export function isExternal(path) {
  return /^(https?:|mailto:|tel:)/.test(path)
}

/**
 * 保留n位小数，保留精度
 * @param {number} num
 * @param {number} n
 * @returns {string}
 */
export function preciseNumber(num, n) {
  const factor = Math.pow(10, n)
  const roundedValue = Math.round(num * factor) / factor
  return roundedValue.toFixed(n)
}

/**
 * 根据文件大小换算单位显示
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} 字节`
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }
}

/**
 * 将任意对象数组转成树结构
 * @param {array} data [
 *  { 'level1': '21', 'level1-id': '1', 'level2': '22', 'level2-id': '2', 'level2Extra': 'B','level3': '23', 'level3-id': '3' }
 * ]
 * @param {array} levels [
 *   { label: "level1", value: "level1-id" }
 *   { label: "level2", value: "level2-id" extras: ["level2Extra"] },
 *   { label: "level3", value: "level3-id" }
 * ]
 * @returns {array} [{
    "label": "21",
    "value": "1",
    "children": [
      {
        "label": "22",
        "value": "2",
        "children": [{"label": "23", "value": "3", "children": [] }],
        "level2Extra": "B"
      }
    ]
  }]
 */
export function transformToTree(data, levels) {
  const result = []
  const nodesMap = {}

  data.forEach(item => {
    let parent = null

    levels.forEach((level, index) => {
      const labelKey = level.label // Key in flat data providing label
      const valueKey = level.value // Key in flat data providing value (ID), valueKey can be empty
      const labelValue = item[labelKey] // Actual label value
      const value = item[valueKey] // Actual ID value
      const extraValues = level.extras ? level.extras.map(extraKey => item[extraKey]) : []
      const extraValuesKey = extraValues.filter(v => isValidValue(v)).join('-')

      // Generate a unique identifier for the node
      const nodeId = valueKey && value
        ? `${valueKey}-${value}-${extraValuesKey}`
        : `${labelKey}-${labelValue}-${extraValuesKey}`

      // Create a new node if it doesn't already exist
      if (!nodesMap[nodeId]) {
        const node = {
          label: labelValue, // 'label' is the value from the label key
          children: []
        }

        if (valueKey) {
          node.value = value // 'value' is the value from the ID key
        }

        // Add extra attributes only if it's the deepest level
        if (index === levels.length - 1) {
          extraValues.forEach((extraValue, idx) => {
            node[level.extras[idx]] = extraValue
          })
        }

        nodesMap[nodeId] = node

        // Add to result or parent node's children array
        if (!parent) {
          result.push(node)
        } else {
          parent.children.push(node)
        }
      }

      // Update parent to the current node
      parent = nodesMap[nodeId]
    })
  })

  // Remove empty children arrays
  function removeEmptyChildren(node) {
    if (node.children.length === 0) {
      delete node.children
    } else {
      node.children.forEach(removeEmptyChildren)
    }
  }

  result.forEach(removeEmptyChildren)

  return result
}

/**
 * 按照指定字符串插入空格
 * @param {string} str
 * @param {number} num
 * @returns {string}
 */
export function insertSpaces(str, num) {
  if (typeof (str) !== 'string') return

  const result = []
  for (let i = 0; i < str.length; i += num) {
    result.push(str.slice(i, i + num))
  }
  return result.join(' ')
}
