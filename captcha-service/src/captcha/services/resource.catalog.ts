import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type ResourceAsset = {
  path: string
  sha256?: string
  group?: string
  status?: 'ACTIVE' | 'RETIRED'
}

type ResourceManifest = {
  schemaVersion: string
  resourceVersion: string
  provider: string
  sets?: Array<{
    type: string
    targetGroups?: string[]
    assets?: Array<string | ResourceAsset>
  }>
}

/** Reads only the active, allow-listed version. Answers never live in this catalog. */
export class ResourceCatalog {
  private readonly root: string | undefined
  private readonly cache = new Map<string, string>()
  private manifest: ResourceManifest | undefined
  private contentRoot: string | undefined

  constructor() {
    const candidates = [
      process.env.CAPTCHA_RESOURCE_DIR,
      join(process.cwd(), 'dist/resources/captcha'),
      join(process.cwd(), 'resources/captcha'),
      join(process.cwd(), 'captcha-service/resources/captcha'),
    ].filter((value): value is string => Boolean(value))
    this.root = candidates.find(
      (value) => existsSync(join(value, 'active.json')) || existsSync(join(value, 'manifest.json'))
    )
    this.reload()
  }

  resourceVersion(type: string) {
    if (!['GRID_IMAGE_SELECT', 'CLICK_ORDER', 'ROTATE'].includes(type)) return null
    return this.manifest?.resourceVersion || null
  }

  gridImage(group: number, variant = 0) {
    return this.image('GRID_IMAGE_SELECT', group, variant)
  }

  gridTargetImage(group: number) {
    return this.imageByPrefix('GRID_IMAGE_SELECT', group, 'grid-target')
  }

  groupCount(type: 'GRID_IMAGE_SELECT' | 'CLICK_ORDER' | 'ROTATE') {
    return this.manifest?.sets?.find((item) => item.type === type)?.targetGroups?.length || 0
  }

  image(type: 'GRID_IMAGE_SELECT' | 'CLICK_ORDER' | 'ROTATE', group: number, variant = 0) {
    if (!this.manifest || !this.contentRoot) return null
    const set = this.manifest.sets?.find((item) => item.type === type)
    const groups = set?.targetGroups || []
    const name = groups[Math.abs(group) % Math.max(groups.length, 1)]
    if (!name) return null
    const directory = type === 'GRID_IMAGE_SELECT' ? 'grid' : type === 'CLICK_ORDER' ? 'click-order' : 'rotate'
    return this.imageByPrefix(type, group, directory, variant)
  }

  private imageByPrefix(
    type: 'GRID_IMAGE_SELECT' | 'CLICK_ORDER' | 'ROTATE',
    group: number,
    directory: string,
    variant = 0
  ) {
    if (!this.manifest || !this.contentRoot) return null
    const set = this.manifest.sets?.find((item) => item.type === type)
    const groups = set?.targetGroups || []
    const name = groups[Math.abs(group) % Math.max(groups.length, 1)]
    if (!name) return null
    const assets = (set?.assets || [])
      .map((asset) => (typeof asset === 'string' ? { path: asset } : asset))
      .filter((asset) => asset.status !== 'RETIRED')
      .filter((asset) => asset.path.startsWith(`${directory}/${name}/`))
    if (!assets.length) return null
    const asset = assets[Math.abs(variant) % assets.length]
    const key = `${this.manifest.resourceVersion}:${asset.path}`
    const cached = this.cache.get(key)
    if (cached) return cached
    const path = join(this.contentRoot, asset.path)
    if (!existsSync(path)) return null
    const dataUrl = `data:${this.mime(asset.path)};base64,${readFileSync(path).toString('base64')}`
    this.cache.set(key, dataUrl)
    return dataUrl
  }

  /** Reloads only an atomically published version pointer. */
  reload() {
    this.cache.clear()
    this.manifest = undefined
    this.contentRoot = undefined
    if (!this.root) return
    const pointerPath = join(this.root, 'active.json')
    if (existsSync(pointerPath)) {
      const pointer = JSON.parse(readFileSync(pointerPath, 'utf8')) as { directory?: string }
      if (!pointer.directory || pointer.directory.includes('..') || pointer.directory.startsWith('/')) return
      const versionRoot = join(this.root, pointer.directory)
      const versionManifest = join(versionRoot, 'manifest.json')
      if (!existsSync(versionManifest)) return
      this.manifest = JSON.parse(readFileSync(versionManifest, 'utf8')) as ResourceManifest
      this.contentRoot = versionRoot
      return
    }
    const manifestPath = join(this.root, 'manifest.json')
    if (!existsSync(manifestPath)) return
    this.manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ResourceManifest
    this.contentRoot = this.root
  }

  private mime(path: string) {
    if (path.endsWith('.png')) return 'image/png'
    if (path.endsWith('.svg')) return 'image/svg+xml'
    if (path.endsWith('.webp')) return 'image/webp'
    return 'image/jpeg'
  }
}
