import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateOrganizationDto {
  @IsString() @Matches(/^[a-z][a-z0-9_-]{1,63}$/) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsOptional() @IsUUID() parentId?: string
}

export class UpdateOrganizationDto {
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsOptional() @IsUUID() parentId?: string | null
}

export class CreateDepartmentDto {
  @IsString() @Matches(/^[a-z][a-z0-9_-]{1,63}$/) code!: string
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsUUID() organizationId!: string
  @IsOptional() @IsUUID() parentId?: string
}

export class UpdateDepartmentDto {
  @IsString() @MinLength(1) @MaxLength(128) name!: string
  @IsOptional() @IsUUID() parentId?: string | null
  @IsOptional() @IsUUID() organizationId?: string
}

export class OrganizationStatusDto {
  @IsIn(['ACTIVE', 'DISABLED']) status!: 'ACTIVE' | 'DISABLED'
  @IsString() @Matches(/\S/) @MaxLength(255) reason!: string
}
