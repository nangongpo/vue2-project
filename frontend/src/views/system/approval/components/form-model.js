export function cloneForm(value) {
  return JSON.parse(JSON.stringify(value || {}))
}

export const formModel = {
  props: { value: { type: Object, default: () => ({}) } },
  data() {
    return { local: cloneForm(this.value) }
  },
  watch: {
    value: {
      deep: true,
      handler(value) {
        const next = cloneForm(value)
        if (JSON.stringify(next) !== JSON.stringify(this.local)) this.local = next
      },
    },
  },
  methods: {
    updateField(field, value) {
      this.$set(this.local, field, value)
      this.$emit('input', cloneForm(this.local))
    },
  },
}
