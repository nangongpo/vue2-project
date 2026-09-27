import { PageNodeType, PrismaClient, RoleType } from '@prisma/client'
import { loadEnvFile } from 'node:process'
import {
  ADMIN_APIS,
  allowedRoleTypesForPermission,
  PAGE_PERMISSION_ROLE_POLICIES,
  roleAllowsPermission,
} from '../security/policies/permission-catalog.js'
import { PasswordService } from '../security/services/password.service.js'
import { BUTTON_FIELD_PERMISSIONS } from '../security/policies/button-field-policy.js'
import { DATA_FIELD_DEFINITIONS, DATA_FIELD_PERMISSIONS } from '../security/policies/static-field-definitions.js'
import { PAGE_PERMISSION_API_CODES, PAGE_PERMISSION_DOMAINS } from './page-permission-bindings.js'

try {
  loadEnvFile()
} catch {
  /* Deployment may inject environment directly. */
}
const prisma = new PrismaClient()
const passwords = new PasswordService()
const pages = [
  {
    code: 'system',
    name: '平台管理',
    route: '/system',
    icon: 'platform-manage',
    type: 'SECURITY',
    component: null,
    nodeType: PageNodeType.DIRECTORY,
  },
  {
    code: 'page.system.user',
    name: '用户管理',
    route: '/system/user',
    icon: 'user-info',
    type: 'SECURITY',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.role',
    name: '角色管理',
    route: '/system/role',
    icon: 'role-info',
    type: 'SECURITY',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.permission',
    name: '权限管理',
    route: '/system/permission',
    icon: 'platform-manage',
    type: 'SECURITY',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.api',
    name: '接口管理',
    route: '/system/api',
    icon: 'platform-manage',
    type: 'SECURITY',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.approval',
    name: '授权审批',
    route: '/system/approval',
    icon: 'platform-manage',
    type: 'BUSINESS',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.audit',
    name: '审计日志',
    route: '/system/audit',
    icon: 'user-log',
    type: 'AUDIT',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.health',
    name: '系统状态',
    route: '/system/health',
    icon: 'platform-manage',
    type: 'SYSTEM',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'page.system.ops-tickets',
    name: '运维应急工单',
    route: '/system/ops-tickets',
    icon: 'platform-manage',
    type: 'SECURITY',
    parentCode: 'system',
    nodeType: PageNodeType.PAGE,
  },
  {
    code: 'business',
    name: '业务管理',
    route: '/business',
    icon: 'nested',
    type: 'BUSINESS',
    component: null,
    nodeType: PageNodeType.DIRECTORY,
  },
  {
    code: 'page.business.order-manage',
    name: '订单管理',
    route: '/business/order-manage',
    icon: 'nested',
    type: 'BUSINESS',
    parentCode: 'business',
    component: 'business/order-manage/index',
    nodeType: PageNodeType.PAGE,
  },
] as const

const buttonLabels: Record<string, string> = {
  'system.directory.create': '新增目录',
  'system.directory.delete': '删除目录',
  'system.page.create': '新增页面',
  'system.page.update': '编辑页面',
  'system.page.enable': '启用页面',
  'system.page.disable': '停用页面',
  'system.page.delete': '删除页面',
  'system.page.api.bind': '配置页面接口',
  'system.button.create': '新增按钮',
  'system.button.update': '编辑按钮',
  'system.button.status': '启停按钮',
  'system.button.api.bind': '绑定操作接口',
  'system.user.create': '新增用户',
  'system.user.update': '编辑用户',
  'system.user.enable': '启用用户',
  'system.user.disable': '停用用户',
  'system.user.reset-password': '重置密码',
  'system.user.unlock': '解锁用户',
  'system.user.grant': '分配角色',
  'system.role.create': '新增角色',
  'system.role.update': '编辑角色',
  'system.role.enable': '启用角色',
  'system.role.disable': '停用角色',
  'system.role.grant': '配置角色权限',
  'system.role.delete': '删除角色',
  'system.api.create': '新增接口',
  'system.api.update': '编辑接口',
  'system.api.enable': '启用接口',
  'system.api.disable': '停用接口',
  'system.api.delete': '删除接口',
  'system.field.update': '编辑字段权限',
  'system.field.create': '新增字段权限',
  'system.field.status': '启停字段权限',
  'system.data-resource.create': '新增数据对象',
  'system.data-resource.update': '编辑数据对象',
  'system.data-resource.status': '启停数据对象',
  'system.audit.export': '导出审计日志',
  'system.audit.integrity': '校验日志完整性',
  'system.approval.create': '新建审批申请',
  'system.approval.approve': '审批通过',
  'system.approval.execute': '执行审批',
  'system.approval.review': '审计复核',
  'system.approval.cancel': '撤回审批申请',
  'system.data-scope.update': '调整数据范围',
  'system.data-scope.revoke': '撤销数据范围',
  'system.ops-ticket.create': '新建应急工单',
  'system.ops-ticket.update': '编辑应急工单',
  'system.ops-ticket.submit': '提交应急工单',
  'system.ops-ticket.approve': '审批应急工单',
  'system.ops-ticket.execute': '执行应急工单',
  'system.ops-ticket.review': '复核应急工单',
  'system.ops-ticket.cancel': '取消应急工单',
  'system.ops-ticket.evidence.create': '补充工单证据',
  'system.ops-ticket.execution.create': '新增执行记录',
  'system.operation-policy.create': '创建操作策略',
  'system.operation-policy.activate': '启用操作策略',
  'system.operation-policy.status': '启停操作策略',
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
    username: process.env.SEED_SECURITY_USERNAME_2,
    password: process.env.SEED_SECURITY_PASSWORD_2,
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
const administratorRoleTypes: RoleType[] = ['SECURITY', 'SYSTEM', 'AUDIT']
if (
  administratorRoleTypes.some((type) => !accounts.some((account) => account.type === type)) ||
  accounts.filter((account) => account.type === 'SECURITY').length < 2 ||
  accounts.some((account) => !account.username || !account.password || account.password.length < 12) ||
  new Set(accounts.map((a) => a.username)).size !== accounts.length
) {
  throw new Error('请为 SECURITY 配置至少两个独立账号，并为 SYSTEM、AUDIT 各配置一个独立账号；所有口令不少于 12 位且禁止复用账号')
}

try {
  const prepared = await Promise.all(
    accounts.map(async (account) => ({ ...account, hash: await passwords.hash(account.password!) }))
  )
  await prisma.$transaction(
    async (tx) => {
      await tx.permission.updateMany({
        where: {
          code: {
            in: [
              '*',
              'system.permission.manage',
              'system.api.status',
              'button.system.api.status',
              'system.user.status',
              'system.role.status',
            ],
          },
        },
        data: { status: 'DISABLED' },
      })
      const permissions = []
      const pageNodes = new Map<string, { id: string }>()
      for (const entry of ADMIN_APIS) {
        // Preserve operator-selected DISABLED state on repeat runs.
        const { rolePolicy: _rolePolicy, ...permissionEntry } = entry
        permissions.push(
          await tx.permission.upsert({
            where: { code: entry.code },
            create: { ...permissionEntry, type: 'API' },
            update: { ...permissionEntry, type: 'API' },
          })
        )
      }
      for (const page of pages) {
        const pagePolicy = PAGE_PERMISSION_ROLE_POLICIES[page.code]
        const pageRoleTypes =
          pagePolicy?.type === 'ROLE_ALLOWLIST'
            ? pagePolicy.roleTypes
            : pagePolicy
            ? [pagePolicy.roleType]
            : [page.type as RoleType]
        const permission =
          page.nodeType === 'DIRECTORY'
            ? null
            : await tx.permission.upsert({
                where: { code: page.code },
                create: {
                  code: page.code,
                  name: page.name,
                  resource: page.route,
                  action: 'view',
                  type: 'PAGE',
                  roleTypes: { create: pageRoleTypes.map((roleType) => ({ roleType })) },
                },
                update: {
                  name: page.name,
                  resource: page.route,
                  roleTypes: {
                    deleteMany: {},
                    create: pageRoleTypes.map((roleType) => ({ roleType })),
                  },
                },
              })
        if (permission) permissions.push(permission)
        else {
          await tx.permission.updateMany({
            where: { code: page.code, type: 'PAGE' },
            data: { status: 'DISABLED' },
          })
        }
        const node = await tx.systemFunction.upsert({
          where: { code: page.code },
          create: {
            code: page.code,
            name: page.name,
            route: page.route,
            component: 'component' in page ? page.component : `${page.route.slice(1)}/index`,
            icon: page.icon,
            nodeType: page.nodeType,
            parentId: 'parentCode' in page ? pageNodes.get(page.parentCode)?.id || null : null,
            permissionId: permission?.id || null,
          },
          update: {
            name: page.name,
            route: page.route,
            component: 'component' in page ? page.component : `${page.route.slice(1)}/index`,
            icon: page.icon,
            nodeType: page.nodeType,
            parentId: 'parentCode' in page ? pageNodes.get(page.parentCode)?.id || null : null,
            permissionId: permission?.id || null,
          },
        })
        pageNodes.set(page.code, node)
        const pageDomains = PAGE_PERMISSION_DOMAINS[page.code] || []
        const pageApiCodes = PAGE_PERMISSION_API_CODES[page.code] || []
        for (const entry of ADMIN_APIS.filter(
          (api) => pageDomains.includes(api.resource) || pageApiCodes.includes(api.code)
        )) {
          const apiPermission = permissions.find((p) => p.code === entry.code)!
          if (
            entry.method === 'GET' &&
            ['read', 'detail', 'options', 'references', 'target-options', 'grants.read'].includes(entry.action)
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
              roleTypes: { create: { roleType: type } },
            },
            update: { type: 'MANAGEMENT', roleTypes: { deleteMany: {}, create: { roleType: type } } },
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
            },
            update: {
              name: field.name,
              resource: 'system.button',
              action: field.action,
              type: 'FIELD',
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
            },
            update: {
              name: field.name,
              resource: field.code.split('.field.')[0],
              action: field.action,
              type: 'FIELD',
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
        if (!readPermission) throw new Error(`缺少数据字段读取权限：${field.resource}.${field.field}`)
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
      // `status` is an internal Permission enum and must never be exposed by
      // the system.api response. Keep any legacy field grant disabled while
      // the public statusLabel/isActive fields are managed above.
      await tx.permissionField.updateMany({
        where: {
          OR: [
            { resource: 'system.api', field: 'status' },
            { resource: 'system.user', field: 'status' },
            { resource: 'system.role', field: 'status' },
          ],
        },
        data: { status: 'DISABLED' },
      })
      // Materialize the code-owned role policy into the normalized relation
      // table. This makes runtime authorization database-backed and keeps
      // reseeding idempotent when a permission audience changes.
      const uniquePermissions = [...new Map(permissions.map((item) => [item.id, item])).values()]
      for (const permission of uniquePermissions) {
        const persistedPermission = await tx.permission.findUniqueOrThrow({
          where: { id: permission.id },
          include: { roleTypes: { select: { roleType: true } } },
        })
        // Seed is the materialization boundary: catalog-only entries have no
        // relation before this pass, so resolve them from the code-owned
        // declaration once, then make runtime authorization database-only.
        const roleTypes = persistedPermission.roleTypes.length
          ? allowedRoleTypesForPermission(persistedPermission)
          : allowedRoleTypesForPermission(permission)
        await tx.permissionRoleType.deleteMany({
          where: {
            permissionId: permission.id,
            ...(roleTypes.length ? { roleType: { notIn: roleTypes as RoleType[] } } : {}),
          },
        })
        if (roleTypes.length) {
          await tx.permissionRoleType.createMany({
            data: roleTypes.map((roleType) => ({
              permissionId: permission.id,
              roleType: roleType as RoleType,
            })),
            skipDuplicates: true,
          })
        }
      }
      const seededPermissions = await tx.permission.findMany({
        where: { id: { in: uniquePermissions.map((permission) => permission.id) } },
        include: { roleTypes: { select: { roleType: true } } },
      })
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
          update: type === 'BUSINESS' ? { status: 'ACTIVE' } : {},
        })
        if (role.roleType !== type) throw new Error('内置角色职责发生冲突，停止初始化')
        const allowedPermissions = seededPermissions.filter((p) => roleAllowsPermission(type, p))
        for (const permission of allowedPermissions) {
          await tx.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
            create: { roleId: role.id, permissionId: permission.id, grantReason: '受控离线初始化' },
            update: {},
          })
        }
        // Built-in roles are server-owned. Reconcile their grants so old
        // permissions from previous catalogs cannot survive a reseed.
        await tx.rolePermission.deleteMany({
          where: {
            roleId: role.id,
            permissionId: { notIn: [...new Set(allowedPermissions.map((permission) => permission.id))] },
          },
        })
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
