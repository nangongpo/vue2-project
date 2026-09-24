import { BadRequestException } from '@nestjs/common'

export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export type Pagination = {
  page: number
  pageSize: number
}

export function normalizePagination(input: { page?: unknown; pageSize?: unknown } = {}): Pagination {
  const page = Number(input.page ?? DEFAULT_PAGE)
  const pageSize = Number(input.pageSize ?? DEFAULT_PAGE_SIZE)
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new BadRequestException(`分页参数必须是有效整数，pageSize 最大为 ${MAX_PAGE_SIZE}`)
  }
  return { page, pageSize }
}

export function paginationData<T>(items: T[], total: number, pagination: Pagination) {
  return {
    items,
    total: Number(total),
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalPages: Math.ceil(Number(total) / pagination.pageSize),
  }
}
