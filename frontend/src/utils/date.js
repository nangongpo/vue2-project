import dayjs from 'dayjs'
import quarterOfYear from 'dayjs/plugin/quarterOfYear'
dayjs.extend(quarterOfYear)

export function dateFormat(dateStr, format = 'YYYY-MM-DD HH:mm:ss') {
  return dateStr ? dayjs(dateStr).format(format) : ''
}

/**
 * 求两个日期的差值 文档 https://dayjs.fenxianglu.cn/category/display.html#%E5%B7%AE%E5%BC%82
 * @param {string|date} date1
 * @param {string|date} date2
 * @returns {string} 毫秒
 */
export function dateDiff(date1, date2) {
  const x = dayjs(date1)
  const y = dayjs(date2)
  return Math.abs(x.diff(y))
}

/**
 * 最近几天、周、月、年 （包含当天）
 * @param {number} day
 * @param {string} unit // day|week|month|year
 * @param {string} format
 * @return {array} 如 ['1970-01-01 00:00:00', '2023-01-01 23:59:59']
 */
export function getRecentlyDateRange(day, unit, format) {
  const d = dayjs()
  const start = d.subtract(day, unit).startOf('day').add(1, 'day')
  const end = d.endOf('day')
  return [
    format ? start.format(format) : start.toDate(),
    format ? end.format(format) : end.toDate()
  ]
}

/**
 * 获取本(年|季度|月|周|天)
 * @param {date|string|number} date
 * @param {string} unit // day|week|month|quarter|year
 * @param {string} format
 * @returns {array}
 */
export function getCurrentDateRange(date, unit, format) {
  const start = dayjs(date).startOf(unit)
  const end = dayjs(date).endOf(unit)
  return [
    format ? start.format(format) : start.toDate(),
    format ? end.format(format) : end.toDate()
  ]
}

/**
 * 返回最近一年的月份列表
 * @param {string} startDate
 * @param {boolean} isContainCurrentMonth
 * @returns {Array<string>} [{ label: '2025-05', value: '2025-05' }]
 */
export function getLastYearMonths(startDate, isContainCurrentMonth = false) {
  const months = []
  const currentDate = dayjs()
  const start = dayjs(startDate)

  const endMonth = isContainCurrentMonth ? currentDate : currentDate.subtract(1, 'month')

  for (let i = 0; i < 12; i++) {
    const currentMonth = endMonth.subtract(i, 'month')
    if (currentMonth >= start) {
      months.push({
        label: currentMonth.format('YYYY年MM月'),
        value: currentMonth.format('YYYY-MM')
      })
    }
  }

  return months
}

export default dayjs
