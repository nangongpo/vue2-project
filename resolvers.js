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

// export function VxeTableResolver() {
//     return {
//         type: 'component',
//         resolve: (name) => {
//             if (name.startsWith('Vxe')) {
//                 const kebabName = kebabCase(name.slice(3))
//                 return {
//                     name: 'default',
//                     from: `vxe-table/es/${kebabName}`,
//                     sideEffects: `vxe-table/es/${kebabName}/style.css`
//                 }
//             }
//         }
//     }
// }
