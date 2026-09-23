<script>
export default {
  functional: true,
  props: {
    value: {
      type: [String, Number, Function]
    }
  },
  render(h, context) {
    const { props } = context
    const { value } = props
    if (typeof (value) === 'function') {
      return value(h, context)
    }
    return [value]
  }
}
</script>
