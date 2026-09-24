<script lang="jsx">
export default {
  functional: true,
  props: {
    icon: String,
    className: String,
  },
  render(h, context) {
    const { icon, className } = context.props
    const vnodes = []
    if (icon.includes('el-icon')) {
      vnodes.push(<i class={[icon, 'sub-el-icon', className]} />)
    } else {
      vnodes.push(<svg-icon icon-class={icon} class-name={className} />)
    }
    // if (icon) {
    //   if (icon.includes('el-icon')) {
    //     vnodes.push(h('i', { class: [icon, 'sub-el-icon', className] }))
    //   } else {
    //     vnodes.push(h('svg-icon', { props: { 'icon-class': icon, 'class-name': className } }))
    //   }
    // }
    return vnodes
  },
}
</script>
