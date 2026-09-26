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
import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator'
import { AuthGuard } from '../../../security/guards/auth.guard.js'
import { RequirePermissions } from '../../../security/decorators/permission.decorator.js'
import { FieldSecurity } from '../../../common/decorators/field-security.decorator.js'
import { DataFieldSecurity } from '../../../common/decorators/data-field-security.decorator.js'
import { PermissionService, MutationContext } from '../services/permission.service.js'
import { ApprovalService } from '../services/approval.service.js'
import type { ApprovalActor } from '../services/approval.service.js'

class ApiQuery {
  @IsOptional() @IsString() @MaxLength(128) keyword?: string
  @IsOptional() @IsIn(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) method?: string
  @IsOptional() @IsIn(['ACTIVE', 'DISABLED']) status?: 'ACTIVE' | 'DISABLED'
  @Type(() => Number) @IsInt() @Min(1) page = 1
  @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20
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
class PageMetadata {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) name?: string
  @IsOptional() @IsString() @MaxLength(255) route?: string
  @IsOptional() @IsString() @MaxLength(255) @Matches(/^[a-zA-Z0-9_/-]*$/) component?: string
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
}
class CreateFunctionDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{1,127}$/) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsString() @MinLength(1) @MaxLength(255) route!: string
  @IsOptional() @IsString() @MaxLength(255) @Matches(/^[a-zA-Z0-9_/-]*$/) component?: string
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  apiIds?: string[]
}
class ButtonMetadata {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) name?: string
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) label?: string
  @IsOptional() @IsInt() @Min(0) @Max(100000) sort?: number
}
class CreateButtonDto {
  @IsUUID() functionId!: string
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{1,127}$/) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
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
class StatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED'
}

@Controller('permission')
@UseGuards(AuthGuard)
export class PermissionController {
  constructor(
    @Inject(PermissionService) private readonly service: PermissionService,
    @Inject(ApprovalService) private readonly approvals: ApprovalService
  ) {}
  @Get('functions')
  @RequirePermissions('system.page.read')
  @FieldSecurity('button')
  listFunctions() {
    return this.service.listFunctions()
  }
  @Get('functions/:functionId/buttons')
  @RequirePermissions('system.button.read')
  @FieldSecurity('button')
  listButtons(@Param('functionId', ParseUUIDPipe) functionId: string) {
    return this.service.listButtons(functionId)
  }
  @Get('functions/:id/apis')
  @RequirePermissions('system.page.apis')
  listFunctionApis(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.listFunctionApis(id)
  }
  @Post('functions')
  @RequirePermissions('system.page.create')
  createFunction(@Body() body: CreateFunctionDto, @Req() req: MutationContext) {
    return this.service.createFunction(body, req)
  }
  @Patch('functions/:id')
  @RequirePermissions('system.page.update')
  updateFunction(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: PageMetadata,
    @Req() req: MutationContext
  ) {
    if (body.route !== undefined) {
      return this.approvals.create(
        {
          kind: 'PAGE_ROUTE_CHANGE',
          reason: '页面路径变更，提交审批后执行',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          payload: { pageId: id, route: body.route },
        },
        req.user as unknown as ApprovalActor,
        { traceId: req.traceId, method: req.method, path: req.url, ip: req.ip }
      )
    }
    return this.service.updateFunction(id, body, req)
  }
  @Patch('functions/:id/status')
  @RequirePermissions('system.page.disable')
  functionStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusDto,
    @Req() req: MutationContext
  ) {
    return this.service.setStatus('page', id, body.status, req)
  }
  @Patch('functions/:id/apis')
  @RequirePermissions('system.page.bind-api')
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
  @Patch('apis/:id/status')
  @HttpCode(202)
  @RequirePermissions('system.api.disable')
  apiStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusDto,
    @Req() req: MutationContext
  ) {
    return this.approvals.create(
      {
        kind: 'API_STATUS',
        reason: '接口状态变更，提交审批后执行',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        payload: { apiId: id, status: body.status },
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
  @Patch('buttons/:id/status')
  @RequirePermissions('system.button.disable')
  @FieldSecurity('button')
  buttonStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: StatusDto,
    @Req() req: MutationContext
  ) {
    return this.service.setStatus('button', id, body.status, req)
  }
  @Patch('buttons/:id/apis')
  @RequirePermissions('system.button.bind-api')
  @FieldSecurity('button')
  mapButtonApis(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: MapApisDto,
    @Req() req: MutationContext
  ) {
    return this.service.mapButtonApis(id, body.apiIds, req)
  }
}
