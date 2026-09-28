import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { FieldSecurity } from '#app/common/decorators/field-security.decorator.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'
import { PermissionService, MutationContext } from '#app/modules/permission/services/permission.service.js'
import { ApprovalService } from '#app/modules/permission/services/approval.service.js'
import type { ApprovalActor } from '#app/modules/permission/services/approval.service.js'
import { canonicalPagePath } from '#app/modules/permission/policies/policy.js'
import { PaginationQueryDto } from '#app/common/dto/pagination.dto.js'

class ApiQuery extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(128) keyword?: string
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method?: string
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED'
}
class ApiMetadata {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) name?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) resource?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64) action?: string
}
class CreateApiDto {
  @IsString() @MinLength(2) @MaxLength(128) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method!: string
  @IsString() @MinLength(1) @MaxLength(255) path!: string
  @IsString() @MinLength(1) @MaxLength(128) resource!: string
  @IsString() @MinLength(1) @MaxLength(64) action!: string
}
class UpdatePageMetadataDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) name?: string
  @IsOptional() @IsString() @MaxLength(255) @Matches(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/) route?: string
  @IsOptional() @IsString() @MaxLength(255) @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*(?:\/[a-zA-Z][a-zA-Z0-9_-]*)*$/) component?: string
  @IsOptional() @IsString() @MaxLength(128) icon?: string
  @IsOptional() @IsObject() routeProps?: Record<string, unknown>
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
}

class UpdateDirectoryMetadataDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) name?: string
  @IsOptional() @IsString() @MaxLength(255) @Matches(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/) route?: string
  @IsOptional() @IsString() @MaxLength(128) icon?: string
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
}
class CreateFunctionDto {
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{1,127}$/) code?: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @MaxLength(255) @Matches(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/) route!: string
  @IsString() @MaxLength(255) @Matches(/^[a-zA-Z][a-zA-Z0-9_-]*(?:\/[a-zA-Z][a-zA-Z0-9_-]*)*$/) component!: string
  @IsOptional() @IsString() @MaxLength(128) icon?: string
  @IsOptional() @IsObject() routeProps?: Record<string, unknown>
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  apiIds?: string[]
}
class CreateDirectoryDto {
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @MaxLength(255) @Matches(/^\/[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*\/?$/) route!: string
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
  @IsOptional() @IsString() @MaxLength(128) icon?: string
}
class ButtonMetadata {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) label?: string
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
}
class CreateButtonDto {
  @IsUUID() functionId!: string
  @IsString() @Matches(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/) actionKey!: string
  @IsString() @MinLength(1) @MaxLength(128) label!: string
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  apiIds?: string[]
}
class MapApisDto {
  @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) apiIds!: string[]
}
@Controller('permission')
@UseGuards(AuthGuard)
export class PermissionController {
  constructor(
    @Inject(PermissionService) private readonly service: PermissionService,
    @Inject(ApprovalService) private readonly approvals: ApprovalService
  ) {}
  @Get('pages/tree')
  @RequirePermissions('system.page.read')
  @FieldSecurity('button')
  listPageTree() {
    return this.service.listPageTree()
  }
  @Get('pages/base-apis/options')
  @RequirePermissions('system.page.api.options')
  pageBaseApiOptions() {
    return this.service.pageApiOptions()
  }
  @Get('pages/:pageId/buttons')
  @RequirePermissions('system.button.read')
  @FieldSecurity('button')
  listPageButtons(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.service.listPageButtons(pageId)
  }
  @Get('pages/:pageId/base-apis')
  @RequirePermissions('system.page.api.read')
  listPageBaseApis(@Param('pageId', ParseUUIDPipe) pageId: string) {
    return this.service.listPageBaseApis(pageId)
  }
  @Post('pages')
  @RequirePermissions('system.page.create')
  createFunction(@Body() body: CreateFunctionDto, @Req() req: MutationContext) {
    return this.service.createFunction(body, req)
  }
  @Post('directories')
  @RequirePermissions('system.directory.create')
  createDirectory(@Body() body: CreateDirectoryDto, @Req() req: MutationContext) {
    return this.service.createDirectory(body, req)
  }
  @Delete('directories/:id')
  @RequirePermissions('system.directory.delete')
  deleteDirectory(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.service.deleteDirectory(id, req)
  }
  @Patch('directories/:id')
  @RequirePermissions('system.directory.update')
  updateDirectory(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateDirectoryMetadataDto,
    @Req() req: MutationContext
  ) {
    return this.service.updateDirectory(id, body, req)
  }
  @Patch('pages/:id')
  @RequirePermissions('system.page.update')
  async updateFunction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdatePageMetadataDto,
    @Req() req: MutationContext
  ) {
    const riskLevel = await this.service.assertPageMetadataSecurity(id, req)
    const nextRoute = body.route !== undefined ? canonicalPagePath(body.route) : undefined
    const currentRoute = nextRoute !== undefined ? await this.service.getFunctionRoute(id) : undefined
    const componentChanged = body.component !== undefined
    if (riskLevel === 'L3' && ((nextRoute !== undefined && nextRoute !== currentRoute) || componentChanged)) {
      return this.approvals.create(
        {
          kind: 'PAGE_ROUTE_CHANGE',
          reason: '页面路径变更，提交审批后执行',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          payload: {
            pageId: id,
            route: nextRoute,
            ...(body.component !== undefined ? { component: body.component } : {}),
          },
        },
        req.user as unknown as ApprovalActor,
        { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
      )
    }
    return this.service.updateFunction(id, body, req)
  }
  @Delete('pages/:id')
  @RequirePermissions('system.page.delete')
  deleteFunction(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.service.deleteFunction(id, req)
  }
  @Patch('pages/:id/enable')
  @RequirePermissions('system.page.enable')
  async enableFunction(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.toggleFunctionStatus(id, 'ACTIVE', req)
  }

  @Patch('pages/:id/disable')
  @RequirePermissions('system.page.disable')
  async disableFunction(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.toggleFunctionStatus(id, 'DISABLED', req)
  }

  private async toggleFunctionStatus(
    id: string,
    status: 'ACTIVE' | 'DISABLED',
    req: MutationContext
  ) {
    const riskLevel = await this.service.pageStatusRisk(id)
    req.riskLevel = riskLevel
    if (riskLevel === 'L3') {
      return this.approvals.create(
        {
          kind: status === 'ACTIVE' ? 'PAGE_ENABLE' : 'PAGE_DISABLE',
          reason: status === 'ACTIVE' ? '启用系统页面，提交审批后执行' : '停用系统页面，提交审批后执行',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          payload: { pageId: id },
        },
        req.user as unknown as ApprovalActor,
        { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
      )
    }
    return this.service.setStatus('page', id, status, req)
  }

  @Patch('pages/:id/base-apis')
  @RequirePermissions('system.page.api.bind')
  mapFunctionApis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MapApisDto,
    @Req() req: MutationContext
  ) {
    return this.service.mapFunctionApis(id, body.apiIds, req)
  }
  @Get('apis')
  @RequirePermissions('system.api.read')
  @DataFieldSecurity('system.api')
  listApis(@Query() query: ApiQuery) {
    return this.service.listApis(query)
  }
  @Get('api-options')
  @RequirePermissions('system.api.options')
  @DataFieldSecurity('system.api')
  apiOptions() {
    return this.service.apiOptions()
  }
  @Get('buttons/action-options')
  @RequirePermissions('system.button.options')
  operationActionOptions() {
    return this.service.operationActionOptions()
  }
  @Post('apis')
  @HttpCode(202)
  @RequirePermissions('system.api.create')
  createApi(@Body() body: CreateApiDto, @Req() req: MutationContext) {
    return this.approvals.create(
      {
        kind: 'API_CREATE',
        reason: '新增接口，提交审批后执行',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payload: body as unknown as Record<string, unknown>,
      },
      req.user as unknown as ApprovalActor,
      { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
    )
  }
  @Patch('apis/:id')
  @HttpCode(202)
  @RequirePermissions('system.api.update')
  updateApi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApiMetadata,
    @Req() req: MutationContext
  ) {
    return this.approvals.create(
      {
        kind: 'API_UPDATE',
        reason: '接口信息变更，提交审批后执行',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payload: { apiId: id, name: body.name || '' },
      },
      req.user as unknown as ApprovalActor,
      { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
    )
  }
  @Patch('apis/:id/enable')
  @HttpCode(202)
  @RequirePermissions('system.api.enable')
  enableApi(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.approvals.create(
      {
        kind: 'API_ENABLE',
        reason: '启用接口，提交审批后执行',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payload: { apiId: id },
      },
      req.user as unknown as ApprovalActor,
      { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
    )
  }
  @Patch('apis/:id/disable')
  @HttpCode(202)
  @RequirePermissions('system.api.disable')
  disableApi(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.approvals.create(
      {
        kind: 'API_DISABLE',
        reason: '停用接口，提交审批后执行',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payload: { apiId: id },
      },
      req.user as unknown as ApprovalActor,
      { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
    )
  }
  @Get('apis/:id/references')
  @RequirePermissions('system.api.references')
  references(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.references(id)
  }
  @Delete('apis/:id')
  @HttpCode(202)
  @RequirePermissions('system.api.delete')
  async deleteApi(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    await this.approvals.create(
      {
        kind: 'API_DELETE',
        reason: '接口删除，提交审批后执行',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payload: { apiId: id },
      },
      req.user as unknown as ApprovalActor,
      { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
    )
  }
  @Post('buttons')
  @RequirePermissions('system.button.create')
  @FieldSecurity('button')
  createButton(@Body() body: CreateButtonDto, @Req() req: MutationContext) {
    return this.service.createButton(body, req)
  }
  @Patch('buttons/:id')
  @RequirePermissions('system.button.update')
  @FieldSecurity('button')
  updateButton(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ButtonMetadata,
    @Req() req: MutationContext
  ) {
    return this.service.updateButton(id, body, req)
  }
  @Patch('buttons/:id/enable')
  @RequirePermissions('system.button.enable')
  @FieldSecurity('button')
  enableButton(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.service.setStatus('button', id, 'ACTIVE', req)
  }

  @Patch('buttons/:id/disable')
  @RequirePermissions('system.button.disable')
  @FieldSecurity('button')
  disableButton(@Param('id', ParseUUIDPipe) id: string, @Req() req: MutationContext) {
    return this.service.setStatus('button', id, 'DISABLED', req)
  }
  @Patch('buttons/:id/apis')
  @RequirePermissions('system.button.api.bind')
  @FieldSecurity('button')
  mapButtonApis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MapApisDto,
    @Req() req: MutationContext
  ) {
    return this.service.mapButtonApis(id, body.apiIds, req)
  }
}
