<script>
import { renderError } from '@/utils'

export default {
  functional: true,
  props: {
    label: {
      type: [String, Function]
    },
    labelClass: String,
    labelSuffix: String
  },
  renderError,
  render(h, context) {
    const { props } = context
    const { label, labelClass, labelSuffix } = props
    if (typeof (label) === 'function') {
      return h('span', { class: labelClass, style: 'line-height: 1' }, label(h, context))
    }
    return label && h('span', { class: labelClass }, [label, labelSuffix])
  }
}
</script>
