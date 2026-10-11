import { IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator'
import { PaginationQueryDto } from '#app/common/dto/pagination.dto.js'

export class FileListQueryDto extends PaginationQueryDto {}

export class InitiateUploadDto {
  @IsString() @MinLength(1) @MaxLength(255) fileName!: string
  @IsInt() @Min(1) @Max(1_099_511_627_776) fileSize!: number
  @IsOptional() @IsString() @MaxLength(128) declaredMime?: string
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) clientSha256?: string
  @IsString() @MinLength(1) @MaxLength(64) purpose!: string
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,63}$/) resourceType?: string
  @IsOptional() @IsUUID() resourceId?: string
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,63}$/) fieldName?: string
}

export class CompleteUploadDto {
  @IsOptional() @Matches(/^[a-f0-9]{64}$/i) clientSha256?: string
}

export class FileBindingDto {
  @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,63}$/) resourceType!: string
  @IsString() @Matches(/^[A-Za-z0-9:_-]{1,128}$/) resourceId!: string
  @IsOptional() @IsString() @Matches(/^[a-z][a-z0-9_.:-]{0,63}$/) fieldName?: string
  @IsOptional() @IsIn(['PRIVATE', 'INTERNAL', 'RESTRICTED']) visibility?: string
}
