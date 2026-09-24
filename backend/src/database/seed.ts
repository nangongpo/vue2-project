import { PrismaClient, RoleType } from '@prisma/client'
import { loadEnvFile } from 'node:process'
import { ADMIN_APIS, roleAllowsPermission } from '../security/policies/permission-catalog.js'
import { PasswordService } from '../security/services/password.service.js'

try {
  loadEnvFile()
} catch {
  /* Deployment may inject environment directly. */
}
const prisma = new PrismaClient()
const passwords = new PasswordService()
const pages = [
  { code: 'page.system.user', name: '用户管理', route: '/system/user', type: 'SECURITY' },
  { code: 'page.system.role', name: '角色管理', route: '/system/role', type: 'SECURITY' },
  {
    code: 'page.system.permission',
    name: '页面权限',
    route: '/system/permission',
    type: 'SECURITY',
  },
  { code: 'page.system.api', name: '接口管理', route: '/system/permission/api', type: 'SECURITY' },
  {
    code: 'page.system.approval',
    name: '授权审批',
    route: '/system/permission/approval',
    type: 'BUSINESS',
  },
  { code: 'page.system.audit', name: '审计日志', route: '/system/audit', type: 'AUDIT' },
  {
    code: 'page.system.ops-tickets',
    name: '运维应急工单',
    route: '/system/ops-tickets',
    type: 'SECURITY',
  },
] as const

// Bootstrap is deliberately explicit, does not reset existing passwords and never grants '*'.
// Configure distinct people for the two security accounts and the auditor.
const accounts = [
  {
    username: process.env.SEED_ADMIN_USERNAME,
    password: process.env.SEED_ADMIN_PASSWORD,
    type: 'SECURITY' as RoleType,
  },
  {
    username: process.env.SEED_SECURITY_REVIEWER_USERNAME,
    password: process.env.SEED_SECURITY_REVIEWER_PASSWORD,
    type: 'SECURITY' as RoleType,
  },
  {
    username: process.env.SEED_AUDIT_USERNAME,
    password: process.env.SEED_AUDIT_PASSWORD,
    type: 'AUDIT' as RoleType,
  },
  {
    username: process.env.SEED_SYSTEM_USERNAME,
    password: process.env.SEED_SYSTEM_PASSWORD,
    type: 'SYSTEM' as RoleType,
  },
].filter((account) => account.username || account.password)
if (
  !accounts.length ||
  accounts.some((account) => !account.username || !account.password || account.password.length < 12) ||
  new Set(accounts.map((a) => a.username)).size !== accounts.length
) {
  throw new Error('请配置独立管理员账户和不少于 12 位的口令，禁止复用用户名')
}

try {
  const prepared = await Promise.all(accounts.map(async (account) => ({ ...account, hash: await passwords.hash(account.password!) })))
  await prisma.$transaction(
    async (tx) => {
      await tx.permission.updateMany({
        where: { code: { in: ['*', 'system.permission.manage'] } },
        data: { status: 'DISABLED' },
      })
      const permissions = []
      for (const entry of ADMIN_APIS) {
        // Preserve operator-selected DISABLED state on repeat runs.
        permissions.push(
          await tx.permission.upsert({
            where: { code: entry.code },
            create: { ...entry, type: 'API' },
            update: { ...entry, type: 'API' },
          })
        )
      }
      for (const page of pages) {
        const permission = await tx.permission.upsert({
          where: { code: page.code },
          create: {
            code: page.code,
            name: page.name,
            resource: page.route,
            action: 'view',
            type: 'PAGE',
            requiredRoleType: page.type,
          },
          update: { requiredRoleType: page.type },
        })
        permissions.push(permission)
        const node = await tx.systemFunction.upsert({
          where: { code: page.code },
          create: {
            code: page.code,
            name: page.name,
            route: page.route,
            component: `${page.route.slice(1)}/index`,
            permissionId: permission.id,
          },
          update: { permissionId: permission.id },
        })
        const domains: Record<string, string[]> = {
          'page.system.user': ['system.user'],
          'page.system.role': ['system.role', 'system.data'],
          'page.system.permission': ['system.page', 'system.button'],
          'page.system.api': ['system.api'],
          'page.system.approval': ['system.approval'],
          'page.system.audit': ['system.audit'],
          'page.system.ops-tickets': ['system.ops-ticket'],
        }
        for (const entry of ADMIN_APIS.filter((api) => domains[page.code].includes(api.resource))) {
          const apiPermission = permissions.find((p) => p.code === entry.code)!
          if (entry.method === 'GET' && ['read', 'detail', 'options', 'references'].includes(entry.action)) {
            await tx.functionApi.upsert({
              where: { functionId_apiId: { functionId: node.id, apiId: apiPermission.id } },
              create: { functionId: node.id, apiId: apiPermission.id },
              update: {},
            })
          } else {
            const code = `button.${entry.code}`
            const buttonPermission = await tx.permission.upsert({
              where: { code },
              create: {
                code,
                name: entry.name,
                resource: entry.resource,
                action: entry.action,
                type: 'BUTTON',
                requiredRoleType: entry.requiredRoleType,
              },
              update: {},
            })
            permissions.push(buttonPermission)
            const button = await tx.functionButton.upsert({
              where: { code },
              create: {
                functionId: node.id,
                code,
                name: entry.name,
                label: entry.name,
                permissionId: buttonPermission.id,
              },
              update: {},
            })
            await tx.buttonApi.upsert({
              where: { buttonId_apiId: { buttonId: button.id, apiId: apiPermission.id } },
              create: { buttonId: button.id, apiId: apiPermission.id },
              update: {},
            })
          }
        }
      }
      for (const [code, type] of [
        ['system.role.revoke', 'SECURITY'],
        ['system.role.review', 'SECURITY'],
        ['system.user.mfa-reset', 'SECURITY'],
        ['system.audit.review', 'AUDIT'],
      ] as const) {
        permissions.push(
          await tx.permission.upsert({
            where: { code },
            create: {
              code,
              name: code,
              resource: 'approval',
              action: 'review',
              type: 'MANAGEMENT',
              requiredRoleType: type,
            },
            update: { type: 'MANAGEMENT', requiredRoleType: type },
          })
        )
      }
      for (const type of ['SECURITY', 'SYSTEM', 'AUDIT'] as const) {
        const role = await tx.role.upsert({
          where: { code: `builtin_${type.toLowerCase()}` },
          create: {
            code: `builtin_${type.toLowerCase()}`,
            name: { SECURITY: '安全管理员', SYSTEM: '系统管理员', AUDIT: '审计管理员' }[type],
            roleType: type,
          },
          update: {},
        })
        if (role.roleType !== type) throw new Error('内置角色职责发生冲突，停止初始化')
        for (const permission of permissions.filter((p) => roleAllowsPermission(type, p))) {
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
            create: { roleId: role.id, permissionId: permission.id, grantReason: '受控离线初始化' },
            update: {},
          })
        }
        for (const account of prepared.filter((a) => a.type === type)) {
          const user = await tx.user.upsert({
            where: { username: account.username! },
            create: {
              username: account.username!,
              passwordHash: account.hash,
              displayName: account.username!,
            },
            update: {},
          })
          const conflicting = await tx.userRole.findFirst({
            where: {
              userId: user.id,
              revokedAt: null,
              role: { roleType: { notIn: [type, 'BUSINESS'] } },
            },
          })
          if (conflicting) throw new Error('管理员职责互斥，停止初始化')
          await tx.userRole.upsert({
            where: { userId_roleId: { userId: user.id, roleId: role.id } },
            create: { userId: user.id, roleId: role.id, grantReason: '受控离线初始化' },
            update: {},
          })
        }
      }
    },
    { timeout: 30000, isolationLevel: 'Serializable' }
  )
  console.log('权限目录和独立管理员初始化完成；首次登录后必须绑定 MFA。')
} finally {
  await prisma.$disconnect()
}
