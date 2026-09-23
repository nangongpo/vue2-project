import { PrismaClient } from '@prisma/client'
import { randomBytes, scrypt as scryptCallback } from 'node:crypto'
import { loadEnvFile } from 'node:process'

try {
  loadEnvFile()
} catch {
  // 支持通过命令行或部署平台注入环境变量。
}

function hashPassword(password: string) {
  const salt = randomBytes(16)
  return new Promise<string>((resolve, reject) => {
    scryptCallback(password, salt, 64, { N: 16384, r: 8, p: 1 }, (error, derived) => {
      if (error) return reject(error)
      resolve(`scrypt$16384$8$1$${salt.toString('base64url')}$${(derived as Buffer).toString('base64url')}`)
    })
  })
}

const username = process.env.SEED_ADMIN_USERNAME
const password = process.env.SEED_ADMIN_PASSWORD

if (!username || !password || password.length < 12) {
  throw new Error('请设置 SEED_ADMIN_USERNAME，并设置长度不少于 12 位的 SEED_ADMIN_PASSWORD')
}

const prisma = new PrismaClient()

const apiPermissions = [
  ['user:read', '查看用户', 'user', 'GET', '/api/v1/users'],
  ['user:create', '创建用户', 'user', 'POST', '/api/v1/users'],
  ['user:update', '更新用户', 'user', 'PATCH', '/api/v1/users/:userId'],
  ['user:reset-password', '重置用户密码', 'user', 'POST', '/api/v1/users/:userId/reset-password'],
  ['role:read', '查看角色', 'role', 'GET', '/api/v1/roles'],
  ['role:create', '创建角色', 'role', 'POST', '/api/v1/roles'],
  ['role:update', '更新角色', 'role', 'PATCH', '/api/v1/roles/:roleId'],
  ['role:delete', '删除角色', 'role', 'DELETE', '/api/v1/roles/:roleId'],
  ['audit:read', '查看审计日志', 'audit', 'GET', '/api/v1/audit-logs'],
  ['audit:detail', '查看审计详情', 'audit', 'GET', '/api/v1/audit-logs/:id'],
  ['session:read', '查看登录会话', 'session', 'GET', '/api/v1/auth/sessions'],
  ['system.permission.manage', '管理系统权限', 'system', 'ALL', '/api/v1/permission-management'],
] as const

const pageDefinitions = [
  { code: 'page.system.user', name: '用户管理', route: '/system/user', component: 'system/user/index', apis: ['user:read', 'user:create', 'user:update', 'user:reset-password'] },
  { code: 'page.system.role', name: '角色管理', route: '/system/role', component: 'system/role/index', apis: ['role:read', 'role:create', 'role:update', 'role:delete'] },
  { code: 'page.system.audit', name: '审计日志', route: '/system/audit', component: 'system/audit/index', apis: ['audit:read', 'audit:detail'] },
  { code: 'page.system.session', name: '会话管理', route: '/system/session', component: 'system/session/index', apis: ['session:read'] },
] as const

try {
  const passwordHash = await hashPassword(password)
  const permission = await prisma.permission.upsert({
    where: { code: '*' },
    update: {},
    create: { code: '*', name: '系统管理员权限', resource: '*', action: '*' },
  })
  const role = await prisma.role.upsert({
    where: { code: 'system_admin' },
    update: { name: '系统管理员', status: 'ACTIVE' },
    create: { code: 'system_admin', name: '系统管理员', status: 'ACTIVE' },
  })
  const permissionByCode = new Map<string, { id: string }>()
  permissionByCode.set('*', permission)
  for (const [code, name, resource, method, path] of apiPermissions) {
    const item = await prisma.permission.upsert({
      where: { code },
      update: { name, resource, action: code, method, path, type: 'API' },
      create: { code, name, resource, action: code, method, path, type: 'API' },
      select: { id: true },
    })
    permissionByCode.set(code, item)
  }
  for (const page of pageDefinitions) {
    const pagePermission = await prisma.permission.upsert({
      where: { code: page.code },
      update: { name: page.name, resource: page.route, action: page.code, type: 'PAGE' },
      create: { code: page.code, name: page.name, resource: page.route, action: page.code, type: 'PAGE' },
      select: { id: true },
    })
    permissionByCode.set(page.code, pagePermission)
    const functionItem = await prisma.systemFunction.upsert({
      where: { code: page.code },
      update: { name: page.name, route: page.route, component: page.component, status: 'ACTIVE', permissionId: pagePermission.id },
      create: { code: page.code, name: page.name, route: page.route, component: page.component, permissionId: pagePermission.id },
      select: { id: true },
    })
    await prisma.functionApi.deleteMany({ where: { functionId: functionItem.id } })
    await prisma.functionApi.createMany({
      data: page.apis.map(apiCode => ({ functionId: functionItem.id, apiId: permissionByCode.get(apiCode)!.id })),
      skipDuplicates: true,
    })
  }
  await prisma.rolePermission.createMany({
    data: [...permissionByCode.values()].map(item => ({ roleId: role.id, permissionId: item.id })),
    skipDuplicates: true,
  })
  await prisma.rolePermission.upsert({
    where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
    update: {},
    create: { roleId: role.id, permissionId: permission.id },
  })
  const user = await prisma.user.upsert({
    where: { username },
    update: { passwordHash, status: 'ACTIVE', displayName: '系统管理员' },
    create: { username, passwordHash, displayName: '系统管理员' },
  })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    update: {},
    create: { userId: user.id, roleId: role.id },
  })
  console.log(`管理员初始化完成: ${username}`)
} finally {
  await prisma.$disconnect()
}
