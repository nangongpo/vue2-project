import { Body, Controller, Get, Inject, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common'
import { AuthGuard } from '#app/security/guards/auth.guard.js'
import { RequirePermissions } from '#app/security/decorators/permission.decorator.js'
import { SecurityOperation } from '#app/security/decorators/operation.decorator.js'
import { AuditAction } from '#app/audit/decorators/audit.decorator.js'
import { actorFrom, type ActorRequest } from '#app/modules/role/domain/authorization.js'
import { CreateDepartmentDto, CreateOrganizationDto, OrganizationStatusDto, UpdateDepartmentDto, UpdateOrganizationDto } from '#app/modules/organization/organization.dto.js'
import { OrganizationService } from '#app/modules/organization/organization.service.js'
import { DataFieldSecurity } from '#app/common/decorators/data-field-security.decorator.js'

@Controller()
@UseGuards(AuthGuard)
export class OrganizationController {
  constructor(@Inject(OrganizationService) private readonly service: OrganizationService) {}

  @Get('organizations')
  @RequirePermissions('system.organization.read')
  @DataFieldSecurity('system.organization')
  organizations(@Req() request: ActorRequest) { return this.service.organizations(actorFrom(request)) }

  @Get('departments')
  @RequirePermissions('system.department.read')
  @DataFieldSecurity('system.department')
  departments(@Req() request: ActorRequest) { return this.service.departments(actorFrom(request)) }

  @Post('organizations')
  @RequirePermissions('system.organization.create')
  @SecurityOperation('system.organization.create')
  @AuditAction('organization.create')
  createOrganization(@Body() body: CreateOrganizationDto, @Req() request: ActorRequest) { return this.service.createOrganization(body, actorFrom(request)) }

  @Patch('organizations/:id')
  @RequirePermissions('system.organization.update')
  @SecurityOperation('system.organization.update')
  @AuditAction('organization.update')
  updateOrganization(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateOrganizationDto, @Req() request: ActorRequest) { return this.service.updateOrganization(id, body, actorFrom(request)) }

  @Patch('organizations/:id/status')
  @RequirePermissions('system.organization.status')
  @SecurityOperation('system.organization.status')
  @AuditAction('organization.status')
  statusOrganization(@Param('id', ParseUUIDPipe) id: string, @Body() body: OrganizationStatusDto, @Req() request: ActorRequest) { return this.service.setOrganizationStatus(id, body.status, body.reason, actorFrom(request)) }

  @Post('departments')
  @RequirePermissions('system.department.create')
  @SecurityOperation('system.department.create')
  @AuditAction('department.create')
  createDepartment(@Body() body: CreateDepartmentDto, @Req() request: ActorRequest) { return this.service.createDepartment(body, actorFrom(request)) }

  @Patch('departments/:id')
  @RequirePermissions('system.department.update')
  @SecurityOperation('system.department.update')
  @AuditAction('department.update')
  updateDepartment(@Param('id', ParseUUIDPipe) id: string, @Body() body: UpdateDepartmentDto, @Req() request: ActorRequest) { return this.service.updateDepartment(id, body, actorFrom(request)) }

  @Patch('departments/:id/status')
  @RequirePermissions('system.department.status')
  @SecurityOperation('system.department.status')
  @AuditAction('department.status')
  statusDepartment(@Param('id', ParseUUIDPipe) id: string, @Body() body: OrganizationStatusDto, @Req() request: ActorRequest) { return this.service.setDepartmentStatus(id, body.status, body.reason, actorFrom(request)) }
}
