<script>
import ElTable from 'element-ui/lib/table.js'
import ElTableColumn from 'element-ui/lib/table-column.js'
import RenderHeader from './render-header.vue'
import RenderCell from './render-cell.vue'

import { renderError, numberToPx } from '@/utils'
import { isNormalColumn } from './utils'

const tableProps = {
  height: [Number, String],

  fields: {
    type: Array,
    default() {
      return []
    },
  },

  fieldAttrs: {
    type: Object,
    default() {
      return {}
    },
  },

  actionAttrs: {
    type: Object,
    default() {
      return {
        fixed: 'right',
      }
    },
  },

  border: {
    type: Boolean,
    default: false,
  },

  stripe: {
    type: Boolean,
    default: false,
  },
}

const getStableHeight = (height) => numberToPx(height) || '120px'

function createTable(h, context) {
  const { data, props, scopedSlots } = context
  const { height, fields, fieldAttrs, actionAttrs, border, stripe } = props

  const createColumn = (column) => {
    if (!column || column.display === false) return null

    const {
      type,
      other_attrs = {},
      label,
      prop,
      prop_class,
      prop_overflow = false,
      width,
      minWidth,
      children = [],
      ...rest
    } = column

    const isStringLabel = typeof label === 'string'

    const scopedSlotsConfig = {}

    if (isNormalColumn(column)) {
      if (!isStringLabel) {
        scopedSlotsConfig.header = function (scope) {
          return h(RenderHeader, {
            props: {
              scope,
              label,
            },
          })
        }
      }

      scopedSlotsConfig.default = function (scope) {
        return h(RenderCell, {
          props: {
            scope,
            config: column,
            item: rest,
            parent: context,
          },
        })
      }
    }

    if (type === 'expand' && scopedSlots.expand) {
      scopedSlotsConfig.default = function (scope) {
        return scopedSlots.expand(scope)
      }
    }

    return h(
      ElTableColumn,
      {
        props: {
          type: type,
          prop,
          label: isStringLabel ? label : undefined,
          width: width,
          minWidth: minWidth,
          className: prop_class,
          showOverflowTooltip: prop_overflow,
          ...fieldAttrs,
          ...other_attrs,
        },
        scopedSlots: scopedSlotsConfig,
      },
      children.map(createColumn).filter(Boolean)
    )
  }

  const columns = fields.map(createColumn).filter(Boolean)

  if (scopedSlots.action) {
    columns.push(
      h(ElTableColumn, {
        props: {
          label: '操作',
          prop: 'action',
          ...fieldAttrs,
          ...actionAttrs,
        },
        scopedSlots: {
          default: scopedSlots.action,
        },
      })
    )
  }

  return h(
    // The locked Element UI package does not expose table-virtual. Keep the
    // BaseTable public API stable and use the compatible standard table.
    ElTable,
    {
      ...data,
      props: {
        ...(data.props || {}),
        height,
        border,
        stripe,
      },
      style: {
        ...(data.style || {}),
        // height: numberToPx(height)
      },
    },
    columns
  )
}

const BaseTableShell = {
  name: 'BaseTableShell',
  props: {
    baseProps: {
      type: Object,
      required: true,
    },
    vnodeData: {
      type: Object,
      default() {
        return {}
      },
    },
  },
  data() {
    return {
      tableReady: false,
      deferTimer: null,
      rafId: null,
      secondRafId: null,
    }
  },
  mounted() {
    this.rafId = requestAnimationFrame(() => {
      this.secondRafId = requestAnimationFrame(() => {
        this.deferTimer = setTimeout(() => {
          this.tableReady = true
        }, 0)
      })
    })
  },
  beforeDestroy() {
    if (this.rafId) cancelAnimationFrame(this.rafId)
    if (this.secondRafId) cancelAnimationFrame(this.secondRafId)
    if (this.deferTimer) clearTimeout(this.deferTimer)
  },
  render(h) {
    const { staticClass, class: dynamicClass, style } = this.vnodeData

    if (!this.tableReady) {
      return h('div', {
        staticClass: staticClass,
        class: ['base-table-placeholder', dynamicClass],
        style: {
          ...(style || {}),
          height: getStableHeight(this.baseProps.height),
        },
      })
    }

    return createTable(h, {
      data: this.vnodeData,
      props: this.baseProps,
      scopedSlots: this.$scopedSlots,
    })
  },
}

export default {
  functional: true,

  props: tableProps,

  renderError,

  render(h, context) {
    return h(BaseTableShell, {
      props: {
        baseProps: context.props,
        vnodeData: context.data,
      },
      scopedSlots: context.scopedSlots,
    })
  },
}
</script>

<style scoped>
.base-table-placeholder {
  width: 100%;
  overflow: hidden;
}
</style>
