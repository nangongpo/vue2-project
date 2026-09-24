<script>
import RenderLabel from './render-label.vue'
import RenderValue from './render-value.vue'
import { renderError, isValidValue, numberToPx } from '@/utils'

import { getFormItemWidth, getFormItemValue } from './utils'

export default {
  functional: true,
  props: {
    fields: {
      type: Array,
      default() {
        return []
      },
    },
    model: {
      type: Object,
      default() {
        return {}
      },
    },
    rules: {
      // 用于覆盖 patterns 的值, 如：{ prop: [{ required: true, message: '' }]}
      type: Object,
      default() {
        return {}
      },
    },
    patterns: {
      // 正则表达式列表， 如：{ pattern: /[0-9]/g, message: '不合格' }
      type: Object,
      default() {
        return {}
      },
    },
    propWidth: String,
    propOverflow: Boolean, // 没render时溢出省略号
    labelWidth: String,
    valueWidth: String,
    labelSuffix: String,
    labelAsPlaceholder: Boolean,
    allOptions: {
      type: Object,
      default() {
        return {}
      },
    },
    filterOptionBy: {
      // 过滤映射关系，保留有效值
      type: String,
      default: 'is_valid',
    },
    defaultValue: {
      type: String,
      default: '—',
    },
  },
  renderError,
  render(h, context) {
    const { props, data, scopedSlots } = context
    const {
      fields,
      model,
      rules,
      patterns,
      propOverflow,
      propWidth,
      labelWidth,
      labelSuffix,
      valueWidth,
    } = props
    const newRules = {}

    const formItemNodes = fields.reduce((acc, item, index) => {
      const {
        render,
        label,
        label_class,
        prop = '',
        prop_overflow = propOverflow,
        prop_width = propWidth,
        label_width = labelWidth,
        value_width = valueWidth,
        prop_height,
        pattern = patterns[item.prop],
        prop_class,
        prop_type,
        display = true,
        null_value_display = true,
        required = false,
        placeholder,
        other_attrs = {},
        ...restItem
      } = item
      // 显示的表单项
      const isDisplay = null_value_display ? display : isValidValue(model[prop])
      // 不显示表单项跳过
      if (!isDisplay) {
        return acc
      }
      // prop为空时，清空labelSuffix
      const newLabelSuffix = prop ? labelSuffix : ''
      const formItemWidth = getFormItemWidth(item, model, prop_width)

      // render为空时
      if (!render) {
        const elementInfo = getFormItemValue(item, model, context)
        const childrenNodes = []
        if (label) {
          childrenNodes.push(
            h(
              'label',
              {
                class: 'el-form-item__label',
                style: { width: numberToPx(label_width) },
              },
              [
                h(RenderLabel, {
                  props: { label, labelClass: label_class, labelSuffix: newLabelSuffix },
                }),
              ]
            )
          )
        }
        if (item.prop) {
          childrenNodes.push(
            h(
              'div',
              {
                class: ['el-form-item__content', { 'text-overflow': prop_overflow }],
                style: { width: numberToPx(value_width) },
                attrs: { title: prop_overflow ? elementInfo.cellValue : '' },
              },
              elementInfo.cellValue
            )
          )
        }
        return [
          ...acc,
          h(
            'div',
            {
              class: ['el-form-item', 'el-form-item--mini', prop_class],
              style: { width: `${formItemWidth}`, height: numberToPx(prop_height) },
              key: index,
            },
            childrenNodes
          ),
        ]
      }

      if (prop) {
        // 构造校验规则
        if (rules[prop]) {
          newRules[prop] = rules[prop]
        } else {
          const rules = []
          if (required) {
            const requiredRule = {
              type: prop_type,
              required,
              message: placeholder || `${label}必填`,
              trigger: 'blur',
            }
            rules.push(requiredRule)
          }
          if (pattern) {
            rules.push(pattern)
          }
          newRules[prop] = rules.length > 0 ? rules : undefined
        }
      }

      return [
        ...acc,
        h('el-form-item', {
          class: prop_class,
          style: { width: `${formItemWidth}`, height: numberToPx(prop_height) },
          props: {
            prop,
            label: typeof label === 'function' ? '' : label,
            labelWidth: numberToPx(label_width),
            ...other_attrs,
          },
          scopedSlots: {
            label: () =>
              h(RenderLabel, {
                props: { label, labelClass: label_class, labelSuffix: newLabelSuffix },
              }),
            default: () =>
              h(RenderValue, {
                props: { config: item, item: restItem, parent: context },
              }),
          },
          key: index,
        }),
      ]
    }, [])

    return h('el-form', {
      ...data,
      staticClass: 'base-form ' + data.staticClass,
      props: {
        ...(data.props || {}),
        model,
        rules: newRules,
        labelSuffix,
        labelWidth,
        validateOnRuleChange: false,
      },
      scopedSlots: {
        default: () => {
          const defaultVNodes = []
          if (scopedSlots.header) {
            defaultVNodes.push(scopedSlots.header())
          }
          defaultVNodes.push(formItemNodes)
          if (scopedSlots.footer) {
            defaultVNodes.push(
              h('el-form-item', { props: { labelWidth: '0' } }, [scopedSlots.footer()])
            )
          }
          return defaultVNodes
        },
      },
    })
  },
}
</script>
