import { kebabCase } from "unplugin-vue-components"

export function ElementUIResolver() {
  return {
    type: 'component',
    resolve: (name) => {
      if (name.startsWith('El')) {
        const kebabName = kebabCase(name.slice(2))
        return {
          name: 'default',
          from: `element-ui/lib/${kebabName}`,
          sideEffects: `element-ui/lib/theme-chalk/${kebabName}.css`
        }
      }
    }
  }
}

export function EasyTableResolver() {
  return {
    type: 'component',
    resolve: (name) => {
      if (name.startsWith('Ve')) {
        const kebabName = kebabCase(name)
        return {
          name: 'default',
          from: `vue-easytable/libs/${kebabName}`,
          sideEffects: `vue-easytable/libs/theme-default/${kebabName}.css`
        }
      }
    }
  }
}
