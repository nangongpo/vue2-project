<script>
import { renderError, numberToPx } from '@/utils'
import { getFormItemValue, getComponentAttrs } from './utils'

export default {
  functional: true,
  props: {
    config: Object,
    item: Object,
    parent: Object
  },
  renderError,
  render(h, context) {
    const { config = {}, item = {}, parent = {} } = context.props
    const { labelAsPlaceholder, model, valueWidth } = parent.props
    const { render, label, value_width = valueWidth, prop, placeholder, editable } = config
    // 表单元素的宽度
    const width = numberToPx(value_width)
    const { value, cellValue, options, defaultValue } = getFormItemValue(config, model, parent)

    // 无render，返回转义值
    if (!render) {
      return [cellValue]
    }

    const newPlaceholder = placeholder || (labelAsPlaceholder ? label : placeholder)

    const elementAttrs = {
      config,
      prop,
      value,
      attrs: getComponentAttrs({
        style: { width },
        ...item,
        options,
        placeholder: newPlaceholder,
        disabled: !editable
      }),
      setValue: (newValue) => {
        const { listeners } = parent
        if (!listeners['update:model']) {
          return renderError(h, { stack: `:model.sync="model"` })
        }
        model[prop] = newValue
        listeners['update:model'](model)
      }
    }

    const scopedSlots = parent.scopedSlots
    if (typeof (render) === 'function') {
      scopedSlots[render] = (attrs) => render(h, attrs)
    }
    if (!scopedSlots[render]) {
      return renderError(h, { stack: `${render} slot is undefined` })
    }

    // 表单项禁用时，无效值填充
    if (!editable && value == null) {
      return [defaultValue]
    }

    return scopedSlots[render](elementAttrs)
  }
}
</script>
