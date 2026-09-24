<script>
import { renderError, isValidValue } from '@/utils'
import { getTableColumnValue, getComponentAttrs } from './utils'

export default {
  functional: true,
  props: {
    scope: Object,
    config: Object,
    item: Object,
    parent: Object,
  },
  renderError,
  render(h, context) {
    const { scope = {}, config = {}, item = {}, parent = {} } = context.props
    const { render, prop, editable } = config
    const { value, cellValue, options, defaultValue } = getTableColumnValue(
      config,
      scope.row,
      parent
    )

    scope['value'] = value
    scope['prop'] = prop
    scope['attrs'] = getComponentAttrs({ ...item, options, disabled: !editable })
    scope['config'] = config
    scope['cellValue'] = cellValue
    scope['setValue'] = (newValue) => {
      scope.row[prop] = newValue
    }

    if (typeof render === 'function') {
      return render(h, scope) || [defaultValue]
    }

    return [isValidValue(cellValue) ? cellValue : defaultValue]
  },
}
</script>
