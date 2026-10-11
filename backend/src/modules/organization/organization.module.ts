import { Module } from '@nestjs/common'
import { DatabaseModule } from '#app/database/database.module.js'
import { SecurityModule } from '#app/security/security.module.js'
import { OrganizationController } from '#app/modules/organization/organization.controller.js'
import { OrganizationService } from '#app/modules/organization/organization.service.js'

@Module({ imports: [DatabaseModule, SecurityModule], controllers: [OrganizationController], providers: [OrganizationService], exports: [OrganizationService] })
export class OrganizationModule {}
