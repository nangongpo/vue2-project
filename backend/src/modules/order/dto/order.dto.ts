import { IsDateString, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator'
import { PaginationQueryDto } from '../../../common/dto/pagination.dto.js'

const amountPattern = /^\d{1,16}(\.\d{1,2})?$/

export class CreateOrderDto {
  @IsString() @MinLength(1) @MaxLength(128) customerName!: string
  @Matches(amountPattern, { message: '订单金额必须是最多两位小数的非负金额' }) totalAmount!: string
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: '币种必须是 3 位大写字母' }) currency?: string
  @IsOptional() @IsString() @MaxLength(500) remark?: string
}

export class UpdateOrderDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(128) customerName?: string
  @IsOptional() @Matches(amountPattern, { message: '订单金额必须是最多两位小数的非负金额' }) totalAmount?: string
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: '币种必须是 3 位大写字母' }) currency?: string
  @IsOptional() @IsString() @MaxLength(500) remark?: string
}

export class OrderReasonDto {
  @IsString() @Matches(/\S/, { message: '操作原因不能为空' }) @MaxLength(255) reason!: string
}

export class OrderQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(64) keyword?: string
  @IsOptional() @IsString() @Matches(/^(DRAFT|CONFIRMED|CANCELLED|COMPLETED)$/) status?: string
  @IsOptional() @IsDateString() createdFrom?: string
  @IsOptional() @IsDateString() createdTo?: string
}
