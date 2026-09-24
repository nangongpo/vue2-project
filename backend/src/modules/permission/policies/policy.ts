import { BadRequestException } from '@nestjs/common'
import { ApiResponse, successResponse } from '../../../common/http/api-response.js'

export const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export const RETIRED_CODES = ['*', 'system.permission.manage']

// Route templates are compared against Fastify's matched route, never the raw URL.
export function canonicalPath(path: string) {
  if (!/^\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*)(?:\/(?:[a-zA-Z0-9_-]+|:[a-zA-Z][a-zA-Z0-9_]*))*\/?$/.test(path)) {
    throw new BadRequestException('路径必须为明确的路由模板，不允许通配符、查询参数、编码或相对路径')
  }
  return path.replace(/\/$/, '')
}

export function assertApi(input: { code: string; method: string; path: string }) {
  if (RETIRED_CODES.includes(input.code) || !/^[a-z][a-z0-9_.:-]{1,127}$/.test(input.code))
    throw new BadRequestException('权限码无效或已停止使用')
  if (!METHODS.includes(input.method as (typeof METHODS)[number])) throw new BadRequestException('必须指定真实 HTTP 方法')
  const path = canonicalPath(input.path)
  if (!path.startsWith('/api/v1/')) throw new BadRequestException('接口路径必须以 /api/v1/ 开头')
  return path
}

export function assertAcyclic(id: string, parentId: string | null | undefined, pages: Array<{ id: string; parentId: string | null }>) {
  const parents = new Map(pages.map((page) => [page.id, page.parentId]))
  const visited = new Set([id])
  let cursor = parentId
  while (cursor) {
    if (visited.has(cursor)) throw new BadRequestException('页面层级不能形成循环')
    visited.add(cursor)
    if (!parents.has(cursor)) throw new BadRequestException('上级页面不存在')
    cursor = parents.get(cursor)
  }
}

export const ok = <T>(data: T): ApiResponse<T> => successResponse(data)
