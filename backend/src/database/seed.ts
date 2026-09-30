import { PrismaClient } from '@prisma/client'
import { PageNodeType, RoleType } from '#app/common/types/prisma-enums.js'
import { loadEnvFile } from 'node:process'
import { apiButtonLabel } from '#app/common/constants/api-name-labels.js'
import {
  allApiDefinitions,
  allowedRoleTypesForPermission,
  PAGE_PERMISSION_ROLE_POLICIES,
  roleAllowsPermission,
} from '#app/security/policies/permission-catalog/index.js'
import { PasswordService } from '#app/security/services/password.service.js'
import { BUTTON_FIELD_PERMISSIONS } from '#app/security/policies/button-field-policy.js'
import { DATA_FIELD_DEFINITIONS, DATA_FIELD_PERMISSIONS } from '#app/security/policies/static-field-definitions.js'
import { PAGE_PERMISSION_BINDINGS } from '#app/database/page-permission-bindings.js'

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
  throw new Error(
    '请为 SECURITY 配置至少两个独立账号，并为 SYSTEM、AUDIT 各配置一个独立账号；所有口令不少于 12 位且禁止复用账号'
  )
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
              'system.operation-policy.manage',
              'system.operation-policy.create',
              'system.operation-policy.activate',
              'system.operation-policy.status',
              'system.api.status',
              'button.system.api.status',
              'system.button.status',
              'system.field.status',
              'system.data-resource.status',
              'system.user.status',
              'system.role.status',
            ],
          },
        },
        data: { status: 'DISABLED' },
      })
      const permissions: Array<{ id: string; code: string }> = []
      const pageNodes = new Map<string, { id: string }>()
      for (const entry of allApiDefinitions()) {
        // Preserve operator-selected DISABLED state on repeat runs.
        const permissionEntry = {
          code: entry.code,
          name: entry.name,
          method: entry.method,
          path: entry.path,
          resource: entry.resource,
          action: entry.action,
        }
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
        const bindings = PAGE_PERMISSION_BINDINGS[page.code]
        if (!bindings) throw new Error(`页面未声明权限绑定：${page.code}`)
        const resolvedBindings = bindings.map((binding) => {
          const entry = allApiDefinitions().find((api) => api.code === binding.apiCode)
          if (!entry) throw new Error(`页面绑定的接口未登记：${page.code} -> ${binding.apiCode}`)
          const apiPermission = permissions.find((p) => p.code === entry.code)
          if (!apiPermission) throw new Error(`页面绑定的接口权限不存在：${entry.code}`)
          return { binding, entry, apiPermission }
        })
        const pageApiIds = resolvedBindings
          .filter(({ binding }) => binding.type === 'PAGE_API')
          .map(({ apiPermission }) => apiPermission.id)
        await tx.functionApi.deleteMany({
          where: {
            functionId: node.id,
            ...(pageApiIds.length ? { apiId: { notIn: pageApiIds } } : {}),
          },
        })
        const buttonCodes = new Set(
          resolvedBindings
            .filter(({ binding }) => binding.type === 'BUTTON_API')
            .map(({ entry }) => `button.${entry.code}`)
        )
        const existingButtons = await tx.functionButton.findMany({
          where: { functionId: node.id },
          select: { id: true, code: true, permissionId: true },
        })
        for (const button of existingButtons.filter((item) => !buttonCodes.has(item.code))) {
          await tx.buttonApi.deleteMany({ where: { buttonId: button.id } })
          await tx.functionButton.update({
            where: { id: button.id },
            data: { status: 'DISABLED' },
          })
          if (button.permissionId) {
            await tx.permission.update({
              where: { id: button.permissionId },
              data: { status: 'DISABLED' },
            })
          }
        }
        for (const { binding, entry, apiPermission } of resolvedBindings) {
          if (binding.type === 'PAGE_API') {
            if (entry.method !== 'GET') {
              throw new Error(`页面基础接口必须是 GET：${page.code} -> ${entry.code}`)
            }
            await tx.functionApi.upsert({
              where: { functionId_apiId: { functionId: node.id, apiId: apiPermission.id } },
              create: { functionId: node.id, apiId: apiPermission.id },
              update: {},
            })
          } else {
            const code = `button.${entry.code}`
            const actionKey = binding.actionKey
            const label = apiButtonLabel(entry.code)
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
                name: actionKey,
                label,
                permissionId: buttonPermission.id,
              },
              update: { name: actionKey, label },
            })
            await tx.buttonApi.deleteMany({
              where: { buttonId: button.id, apiId: { not: apiPermission.id } },
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
              password: account.hash,
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
