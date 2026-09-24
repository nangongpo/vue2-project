export default {
  multipass: true,
  full: true,
  plugins: [
    {
      name: 'removeAttrs',
      params: {
        attrs: ['fill', 'fill-rule']
      }
    }
  ]
}
