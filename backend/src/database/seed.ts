import { PrismaClient, RoleType } from '@prisma/client'
import { loadEnvFile } from 'node:process'
import { ADMIN_APIS, roleAllowsPermission } from '../security/policies/permission-catalog.js'
import { PasswordService } from '../security/services/password.service.js'
import { BUTTON_FIELD_PERMISSIONS } from '../security/policies/button-field-policy.js'
import {
  DATA_FIELD_DEFINITIONS,
  DATA_FIELD_PERMISSIONS,
} from '../security/policies/static-field-definitions.js'

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
    name: '权限管理',
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
  { code: 'page.system.health', name: '系统状态', route: '/system/health', type: 'SYSTEM' },
  {
    code: 'page.system.ops-tickets',
    name: '运维应急工单',
    route: '/system/ops-tickets',
    type: 'SECURITY',
  },
] as const

const buttonLabels: Record<string, string> = {
  'system.page.create': '新增页面',
  'system.page.update': '编辑页面',
  'system.page.disable': '停用页面',
  'system.page.bind-api': '配置页面接口',
  'system.button.create': '新增按钮',
  'system.button.update': '编辑按钮',
  'system.button.disable': '停用按钮',
  'system.button.bind-api': '绑定操作接口',
  'system.user.create': '新增用户',
  'system.user.update': '编辑用户',
  'system.user.disable': '停用用户',
  'system.user.reset-password': '重置密码',
  'system.user.unlock': '解锁用户',
  'system.user.grant': '分配角色',
  'system.role.create': '新增角色',
  'system.role.update': '编辑角色',
  'system.role.disable': '停用角色',
  'system.role.grant': '配置角色权限',
  'system.role.delete': '删除角色',
  'system.api.create': '新增接口',
  'system.api.update': '编辑接口',
  'system.api.disable': '停用接口',
  'system.api.delete': '删除接口',
  'system.audit.export': '导出审计日志',
  'system.audit.integrity': '校验日志完整性',
  'system.approval.create': '新建审批申请',
  'system.approval.approve': '审批通过',
  'system.approval.execute': '执行审批',
  'system.approval.review': '审计复核',
  'system.data.update': '调整数据范围',
  'system.data.revoke': '撤销数据范围',
  'system.ops-ticket.create': '新建应急工单',
  'system.ops-ticket.update': '编辑应急工单',
  'system.ops-ticket.submit': '提交应急工单',
  'system.ops-ticket.approve': '审批应急工单',
  'system.ops-ticket.execute': '执行应急工单',
  'system.ops-ticket.review': '复核应急工单',
  'system.ops-ticket.cancel': '取消应急工单',
  'system.ops-ticket.evidence': '补充工单证据',
  'system.ops-ticket.executions': '查看执行记录',
  'system.operation-policy.manage': '管理操作策略',
  'system.operation-policy.activate': '启用操作策略',
  'system.operation-policy.disable': '停用操作策略',
}

function buttonLabel(code: string) {
  return buttonLabels[code] || code
}

// Bootstrap is deliberately explicit, does not reset existing passwords and never grants '*'.
// Every high-risk role must have an initial account.
const accounts = [
  {
    username: process.env.SEED_SECURITY_USERNAME,
    password: process.env.SEED_SECURITY_PASSWORD,
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
const requiredRoleTypes: RoleType[] = ['SECURITY', 'SYSTEM', 'AUDIT']
if (
  requiredRoleTypes.some((type) => !accounts.some((account) => account.type === type)) ||
  accounts.some(
    (account) => !account.username || !account.password || account.password.length < 12
  ) ||
  new Set(accounts.map((a) => a.username)).size !== accounts.length
) {
  throw new Error('请为 SECURITY、SYSTEM、AUDIT 分别配置独立账号和不少于 12 位的口令，禁止复用账号')
}

try {
  const prepared = await Promise.all(
    accounts.map(async (account) => ({ ...account, hash: await passwords.hash(account.password!) }))
  )
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
          update: { name: page.name, resource: page.route, requiredRoleType: page.type },
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
          'page.system.health': ['system.health'],
          'page.system.ops-tickets': ['system.ops-ticket'],
        }
        for (const entry of ADMIN_APIS.filter((api) => domains[page.code].includes(api.resource))) {
          const apiPermission = permissions.find((p) => p.code === entry.code)!
          if (
            entry.method === 'GET' &&
            ['read', 'detail', 'options', 'references'].includes(entry.action)
          ) {
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
                label: buttonLabel(entry.code),
                permissionId: buttonPermission.id,
              },
              update: { label: buttonLabel(entry.code) },
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
      for (const field of BUTTON_FIELD_PERMISSIONS) {
        permissions.push(
          await tx.permission.upsert({
            where: { code: field.code },
            create: {
              code: field.code,
              name: field.name,
              resource: 'system.button',
              action: field.action,
              type: 'FIELD',
              requiredRoleType: 'SECURITY',
            },
            update: {
              name: field.name,
              resource: 'system.button',
              action: field.action,
              type: 'FIELD',
              requiredRoleType: 'SECURITY',
            },
          })
        )
      }
      for (const field of DATA_FIELD_PERMISSIONS) {
        permissions.push(
          await tx.permission.upsert({
            where: { code: field.code },
            create: {
              code: field.code,
              name: field.name,
              resource: field.code.split('.field.')[0],
              action: field.action,
              type: 'FIELD',
              requiredRoleType: 'SECURITY',
            },
            update: {
              name: field.name,
              resource: field.code.split('.field.')[0],
              action: field.action,
              type: 'FIELD',
              requiredRoleType: 'SECURITY',
            },
          })
        )
      }
      for (const field of DATA_FIELD_DEFINITIONS) {
        const readPermission = permissions.find(
          (permission) => permission.code === `${field.resource}.field.${field.field}.read`
        )
        const writePermission = permissions.find(
          (permission) => permission.code === `${field.resource}.field.${field.field}.write`
        )
        if (!readPermission)
          throw new Error(`缺少数据字段读取权限：${field.resource}.${field.field}`)
        await tx.permissionField.upsert({
          where: { resource_field: { resource: field.resource, field: field.field } },
          create: {
            resource: field.resource,
            field: field.field,
            name: field.name,
            dataType: field.dataType,
            relationResource: field.relationResource,
            relationModel: field.relationModel,
            relationField: field.relationField,
            riskLevel: field.riskLevel,
            readPermissionId: readPermission.id,
            writePermissionId: writePermission?.id,
          },
          update: {
            name: field.name,
            dataType: field.dataType,
            relationResource: field.relationResource,
            relationModel: field.relationModel,
            relationField: field.relationField,
            riskLevel: field.riskLevel,
            readPermissionId: readPermission.id,
            writePermissionId: writePermission?.id,
          },
        })
      }
      for (const type of ['BUSINESS', 'SECURITY', 'SYSTEM', 'AUDIT'] as const) {
        const role = await tx.role.upsert({
          where: { code: `builtin_${type.toLowerCase()}` },
          create: {
            code: `builtin_${type.toLowerCase()}`,
            name: {
              BUSINESS: '业务管理员',
              SECURITY: '安全管理员',
              SYSTEM: '系统管理员',
              AUDIT: '审计管理员',
            }[type],
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
