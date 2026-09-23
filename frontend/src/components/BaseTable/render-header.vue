<script>
import { renderError } from '@/utils'

export default {
  functional: true,
  props: {
    scope: Object,
    label: [String, Function]
  },
  renderError,
  render(h, context) {
    const { props } = context
    const { label } = props
    if (typeof (label) === 'function') {
      return label(h, context)
    }
    return [label]
  }
}
</script>
