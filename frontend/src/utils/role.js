import { getAllMenu } from '@/router/auto-router'
import userApiList from '@/api/user'

const baseAPI = import.meta.env.VUE_APP_BASE_API

function getRoleTypeMenus(roleType, menuListGroup) {
  if (!roleType || !roleType.length) return []

  let roleTypeMenus = []
  for (const key in menuListGroup) {
    if (roleType.includes(key)) {
      roleTypeMenus = roleTypeMenus.concat(menuListGroup[key])
    }
  }

  return roleTypeMenus
}

function filterMenu(menus = [], roleMenus = []) {
  return menus.reduce((t, menu) => {
    if (!menu.children) {
      return roleMenus.includes(menu.value) ? [...t, { ...menu, children: undefined }] : t
    }
    const children = filterMenu(menu.children, roleMenus)
    return children.length ? [...t, { ...menu, children }] : t
  }, [])
}

function getMenuList(roleType) {
  const { menuList, menuListGroup } = getAllMenu()
  return filterMenu(menuList, getRoleTypeMenus(roleType, menuListGroup))
}

// 根据api列表生成对象菜单
function filterMenuByAPI(menus = [], apis = []) {
  return menus.reduce((t, menu) => {
    if (!menu.children) {
      return apis.includes(menu.api) ? [...t, { ...menu, children: undefined }] : t
    }
    const children = filterMenuByAPI(menu.children, apis)
    return children.length ? [...t, { ...menu, children }] : t
  }, [])
}

// 获取api的中文描述
function getAPIList(menus = [], prefixTitle = []) {
  let res = []

  for (const menu of menus) {
    const data = {
      value: menu.api,
      title: prefixTitle.concat(menu.label),
    }

    if (data.value) {
      data.value = baseAPI + data.value
      res.push(data)
    }

    if (menu.children) {
      const tmpArr = getAPIList(menu.children, data.title)
      if (tmpArr.length >= 1) {
        res = [...res, ...tmpArr]
      }
    }
  }

  return res
}

// 用户操作日志，生成request_url字段的中文描述映射表
function getRequestUrlOptions(menuList) {
  const apiList = getAPIList(menuList)
  const userApis = userApiList.map((v) => {
    return { ...v, value: baseAPI + v.value }
  })
  const apis = apiList.map((v) => {
    return { ...v, label: v.title.join('-') }
  })
  return userApis.concat(apis)
}

export { getAllMenu, getMenuList, filterMenuByAPI, getRequestUrlOptions }
