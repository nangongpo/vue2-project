import 'reflect-metadata'
import { describe, expect, it, vi } from 'vitest'
import { BadRequestException, ValidationPipe } from '@nestjs/common'
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants.js'
import { REQUIRED_PERMISSIONS } from '../../../security/decorators/permission.decorator.js'
import { CreateRoleDto, GrantPermissionsDto, RoleController, UpdateRoleDto } from '../controllers/role.controller.js'
import { AssignRolesDto, CreateUserDto, UpdateUserDto, UserController } from '../../user/controllers/user.controller.js'

const pipe = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
  forbidUnknownValues: true,
})
const uuid = '550e8400-e29b-41d4-a716-446655440000'
const validate = (metatype: any, value: unknown) => pipe.transform(value, { type: 'body', metatype })

describe('role/user authorization HTTP contracts', () => {
  it.each([
    [RoleController, 'list', ['system.role.read']],
    [RoleController, 'permissionOptions', ['system.role.options']],
    [RoleController, 'create', ['system.role.create']],
    [RoleController, 'update', ['system.role.update']],
    [RoleController, 'grants', ['system.role.grant']],
    [RoleController, 'enable', ['system.role.enable']],
    [RoleController, 'disable', ['system.role.disable']],
    [RoleController, 'remove', ['system.role.delete']],
    [UserController, 'page', ['system.user.read']],
    [UserController, 'create', ['system.user.create']],
    [UserController, 'update', ['system.user.update']],
    [UserController, 'roles', ['system.user.grant']],
    [UserController, 'enable', ['system.user.enable']],
    [UserController, 'disable', ['system.user.disable']],
    [UserController, 'unlock', ['system.user.unlock']],
    [UserController, 'resetPassword', ['system.user.reset-password']],
  ])('uses granular capabilities on %s.%s', (controller: any, method: any, codes) => {
    expect(Reflect.getMetadata(REQUIRED_PERMISSIONS, controller.prototype[method])).toEqual(codes)
  })

  it.each([
    [CreateRoleDto, { code: 'operator', name: 'Operator' }],
    [UpdateRoleDto, { code: 'operator', name: 'Operator' }],
    [CreateUserDto, { username: 'test', password: 'Strong-password-123!', displayName: 'Test', roleIds: [uuid] }],
    [UpdateUserDto, { displayName: 'Test', roleIds: [] }],
    [UpdateUserDto, { status: 'ACTIVE' }],
  ])('rejects embedded authorization fields for %s', async (dto, body) => {
    await expect(validate(dto, body)).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each([
    [GrantPermissionsDto, { permissionIds: ['not-uuid'], reason: 'Test' }],
    [GrantPermissionsDto, { permissionIds: [uuid, uuid], reason: 'Test' }],
    [GrantPermissionsDto, { permissionIds: [uuid], reason: ' ' }],
    [AssignRolesDto, { roleIds: ['not-uuid'], reason: 'Test' }],
    [AssignRolesDto, { roleIds: [], reason: 'Test', approvalRef: uuid }],
  ])('rejects invalid grant payloads for %s', async (dto, body) => {
    await expect(validate(dto, body)).rejects.toBeInstanceOf(BadRequestException)
  })

  it.each([
    [RoleController, ['update', 'grants', 'enable', 'disable', 'remove']],
    [UserController, ['update', 'roles', 'enable', 'disable', 'unlock', 'resetPassword']],
  ])('validates every UUID route parameter for %s', async (controller: any, methods: any) => {
    for (const method of methods) {
      const args = Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, method)
      const idArg = Object.values(args).find((arg: any) => arg.data === 'id') as any
      expect(idArg.pipes).toHaveLength(1)
      await expect(new idArg.pipes[0]().transform('123', { type: 'param', data: 'id' })).rejects.toBeInstanceOf(BadRequestException)
    }
  })

  it('forwards only the authenticated internal actor identity to services', () => {
    const service = { grants: vi.fn() }
    const request = {
      user: { internalId: 42n },
      traceId: 'trace',
      ip: '127.0.0.1',
      method: 'PATCH',
      url: `/api/v1/roles/${uuid}/grants`,
      headers: {},
    }
    const body = { permissionIds: [uuid], reason: 'Job duties' }
    new RoleController(service as any).grants(uuid, body, request)
    expect(service.grants).toHaveBeenCalledWith(
      uuid,
      body,
      expect.objectContaining({ internalId: 42n, traceId: 'trace', path: request.url })
    )
  })

  it.each([
    [RoleController, 'enable', 'enable'],
    [RoleController, 'disable', 'disable'],
    [UserController, 'enable', 'enable'],
    [UserController, 'disable', 'disable'],
  ])('routes %s.%s with a fixed action and reason only', (Controller: any, method: any, serviceMethod: any) => {
    const service = { [serviceMethod]: vi.fn() }
    const request = {
      user: { internalId: 42n },
      traceId: 'trace',
      ip: '127.0.0.1',
      method: 'PATCH',
      url: `/api/v1/${Controller === RoleController ? 'roles' : 'users'}/${uuid}/${method}`,
      headers: {},
    }
    new Controller(service)[method](uuid, { reason: 'Rotate access' }, request)
    expect(service[serviceMethod]).toHaveBeenCalledWith(
      uuid,
      'Rotate access',
      expect.objectContaining({ internalId: 42n, traceId: 'trace', path: request.url })
    )
  })
})
