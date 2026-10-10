import { Transform, Type } from 'class-transformer'
import { IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator'
import { FileObjectStatus, FileScanStatus } from '@prisma/client'
import { PaginationQueryDto } from '#app/common/dto/pagination.dto.js'

export class FileAdminQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(255) keyword?: string
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional() @IsEnum(FileObjectStatus) status?: FileObjectStatus
  @Transform(({ value }) => (value === '' ? undefined : value))
  @IsOptional() @IsEnum(FileScanStatus) scanStatus?: FileScanStatus
  @IsOptional() @IsString() @MaxLength(64) resourceType?: string
  @IsOptional() @IsString() @MaxLength(128) resourceId?: string
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000_000_000) minSize?: number
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(1_000_000_000_000) maxSize?: number
}

export class FileAdminReasonDto {
  @IsString() @MaxLength(255) reason!: string
}
