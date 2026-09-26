import {
  CallHandler,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, from, map, switchMap } from 'rxjs'
import { isApiResponse } from '../http/api-response.js'
import { DATA_FIELD_SECURITY_RESOURCE } from '../decorators/data-field-security.decorator.js'
import { PrismaService } from '../../database/prisma.service.js'
import {
  assertRecentSecurityProof,
  maxRiskLevel,
  type RiskLevel,
} from '../../security/policies/risk-policy.js'

type DataFieldRequest = {
  method?: string
  body?: Record<string, unknown>
  user?: {
    permissions?: string[]
    mfaVerifiedAt?: Date | null
    reauthenticatedAt?: Date | null
  }
  riskLevel?: RiskLevel
  fieldRiskLevel?: RiskLevel
}
type FieldDefinition = {
  field: string
  dataType: string
  relationResource?: string | null
  relationModel?: string | null
  relationField?: string | null
  readCode: string
  writeCode?: string
  riskLevel: RiskLevel
  status: string
}

@Injectable()
export class DataFieldSecurityInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const resource = this.reflector.getAllAndOverride<string>(DATA_FIELD_SECURITY_RESOURCE, [
      context.getHandler(),
      context.getClass(),
    ])
    if (!resource) return next.handle()
    const request = context.switchToHttp().getRequest<DataFieldRequest>()
    const permissions = new Set(request.user?.permissions || [])
    return from(this.loadDefinitionGraph(resource)).pipe(
      switchMap((definitionGraph) => {
        const definitions = definitionGraph.get(resource) || []
        if ((request.method === 'PATCH' || request.method === 'POST') && request.body) {
          const writable = new Map(
            definitions
              .filter((definition) => definition.writeCode)
              .map((definition) => [definition.field, definition.writeCode!])
          )
          const changed = Object.keys(request.body)
          const denied = changed.filter(
            (field) =>
              !writable.has(field) ||
              !(permissions.has('*') || permissions.has(writable.get(field)!))
          )
          if (denied.length)
            throw new ForbiddenException(`没有数据字段修改权限：${denied.join('、')}`)
          const riskLevel = maxRiskLevel(
            ...changed.map((field) => {
              const definition = definitions.find((item) => item.field === field)
              return (definition?.riskLevel || 'L3') as RiskLevel
            })
          )
          request.fieldRiskLevel = riskLevel
          request.riskLevel = maxRiskLevel(request.riskLevel || 'L0', riskLevel)
          if (request.riskLevel === 'L2' || request.riskLevel === 'L3') {
            assertRecentSecurityProof(request.user || {}, request.riskLevel)
          }
        }
        return next
          .handle()
          .pipe(map((value) => this.projectResponse(value, resource, definitionGraph, permissions)))
      })
    )
  }

  private async loadDefinitionGraph(rootResource: string) {
    const graph = new Map<string, FieldDefinition[]>()
    const pending = [{ resource: rootResource, depth: 0 }]
    const visited = new Set<string>()

    while (pending.length) {
      const current = pending.shift()!
      if (visited.has(current.resource) || current.depth > 3) continue
      visited.add(current.resource)
      const definitions = await this.prisma.permissionField.findMany({
        where: { resource: current.resource, status: 'ACTIVE' },
        select: {
          field: true,
          dataType: true,
          relationResource: true,
          relationModel: true,
          relationField: true,
          status: true,
          riskLevel: true,
          readPermission: { select: { code: true } },
          writePermission: { select: { code: true } },
        },
      })
      const normalized = definitions.map((definition) => ({
        field: definition.field,
        dataType: definition.dataType,
        relationResource: definition.relationResource,
        relationModel: definition.relationModel,
        relationField: definition.relationField,
        readCode: definition.readPermission.code,
        writeCode: definition.writePermission?.code,
        riskLevel: definition.riskLevel as RiskLevel,
        status: definition.status,
      }))
      graph.set(current.resource, normalized)
      for (const definition of normalized) {
        if (definition.relationResource)
          pending.push({ resource: definition.relationResource, depth: current.depth + 1 })
      }
    }
    return graph
  }

  private readableDefinitions(definitions: FieldDefinition[], permissions: Set<string>) {
    return definitions.filter(
      (definition) => permissions.has('*') || permissions.has(definition.readCode)
    )
  }

  private projectResponse(
    value: unknown,
    resource: string,
    graph: Map<string, FieldDefinition[]>,
    permissions: Set<string>
  ) {
    const projectData = (data: unknown, currentResource: string, depth: number): unknown => {
      if (depth > 3) return undefined
      if (Array.isArray(data)) {
        return data
          .map((item) => projectData(item, currentResource, depth))
          .filter((item) => item !== undefined)
      }
      if (!data || typeof data !== 'object') return data
      const object = data as Record<string, unknown>
      if (Array.isArray(object.items)) {
        return { ...object, items: projectData(object.items, currentResource, depth) }
      }
      const definitions = graph.get(currentResource) || []
      const readable = this.readableDefinitions(definitions, permissions)
      const projected: Record<string, unknown> = {}
      for (const definition of readable) {
        if (!Object.prototype.hasOwnProperty.call(object, definition.field)) continue
        const fieldValue = object[definition.field]
        if (definition.relationResource && fieldValue !== null && fieldValue !== undefined) {
          const projectRelation = (relation: unknown) => {
            if (!definition.relationField || !relation || typeof relation !== 'object') {
              return projectData(relation, definition.relationResource!, depth + 1)
            }
            const wrapper = relation as Record<string, unknown>
            const nested = wrapper[definition.relationField]
            if (nested === undefined) return undefined
            return {
              [definition.relationField]: projectData(
                nested,
                definition.relationResource!,
                depth + 1
              ),
            }
          }
          projected[definition.field] = Array.isArray(fieldValue)
            ? fieldValue.map(projectRelation).filter((item) => item !== undefined)
            : projectRelation(fieldValue)
        } else {
          projected[definition.field] = fieldValue
        }
      }
      return projected
    }
    if (isApiResponse(value)) return { ...value, data: projectData(value.data, resource, 0) }
    return projectData(value, resource, 0)
  }
}
