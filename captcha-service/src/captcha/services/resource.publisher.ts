import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'

export type GeneratedCaptchaAsset = {
  sourcePath: string
  path: string
  group: string
  source: string
  license: string
  types?: Array<'GRID_IMAGE_SELECT' | 'CLICK_ORDER' | 'ROTATE'>
}

export type AiCaptchaImageRequest = {
  groups: string[]
  assetsPerGroup: number
  style: string
  maxWidth: number
  maxHeight: number
}

export interface AiCaptchaImageProvider {
  generate(request: AiCaptchaImageRequest): Promise<GeneratedCaptchaAsset[]>
}

export type PublishGalleryInput = {
  resourceVersion: string
  assets: GeneratedCaptchaAsset[]
}

/**
 * Publishes an AI-generated candidate set as an immutable resource version.
 * The caller must complete human/license/privacy review before invoking publish.
 */
export class ResourcePublisher {
  constructor(private readonly root: string) {}

  async generateAndPublish(
    provider: AiCaptchaImageProvider,
    request: AiCaptchaImageRequest,
    resourceVersion: string
  ) {
    const assets = await provider.generate(request)
    return this.publish({ resourceVersion, assets })
  }

  publish(input: PublishGalleryInput) {
    this.assertVersion(input.resourceVersion)
    if (!input.assets.length) throw new Error('图库不能为空')
    const versionDirectory = join(this.root, 'versions', input.resourceVersion)
    if (existsSync(versionDirectory)) throw new Error('资源版本已存在，禁止覆盖')
    mkdirSync(versionDirectory, { recursive: true })
    const assets = input.assets.map((asset) => this.copyAndHash(versionDirectory, asset))
    const imageSets = ['GRID_IMAGE_SELECT', 'CLICK_ORDER', 'ROTATE'].map((type) => {
      const typedAssets = assets.filter((asset) => asset.types?.includes(type as never) ?? true)
      return {
        id: `${type.toLowerCase()}-basic`,
        type,
        targetGroups: [...new Set(typedAssets.map((asset) => asset.group))],
        assets: typedAssets,
        answerCount: type === 'ROTATE' ? undefined : 3,
        status: 'ACTIVE' as const,
      }
    })
    const manifest = {
      schemaVersion: '1.0',
      resourceVersion: input.resourceVersion,
      provider: 'filesystem',
      licensePolicy: 'reviewed-before-publish',
      sets: imageSets,
    }
    writeFileSync(join(versionDirectory, 'manifest.json.tmp'), JSON.stringify(manifest, null, 2))
    renameSync(join(versionDirectory, 'manifest.json.tmp'), join(versionDirectory, 'manifest.json'))
    mkdirSync(this.root, { recursive: true })
    writeFileSync(
      join(this.root, 'active.json.tmp'),
      JSON.stringify({ directory: relative(this.root, versionDirectory) })
    )
    renameSync(join(this.root, 'active.json.tmp'), join(this.root, 'active.json'))
    return manifest
  }

  private copyAndHash(versionDirectory: string, asset: GeneratedCaptchaAsset) {
    if (!asset.source || !asset.license) throw new Error(`资源 ${asset.path} 缺少来源或许可证`)
    if (!/^(grid|grid-target|click-order|rotate)\/[a-z0-9-]+\/[a-z0-9._-]+\.(jpg|jpeg|png|webp|svg)$/i.test(asset.path))
      throw new Error(`资源路径不符合 allow-list: ${asset.path}`)
    if (!existsSync(asset.sourcePath)) throw new Error(`资源文件不存在: ${asset.sourcePath}`)
    const data = readFileSync(asset.sourcePath)
    if (data.length === 0 || data.length > 2 * 1024 * 1024) throw new Error(`资源大小不符合要求: ${asset.path}`)
    const extension = basename(asset.path).split('.').pop()?.toLowerCase()
    if (extension === 'jpg' || extension === 'jpeg') {
      if (data[0] !== 0xff || data[1] !== 0xd8) throw new Error(`不是有效 JPEG: ${asset.path}`)
    } else if (
      extension === 'png' &&
      !data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ) {
      throw new Error(`不是有效 PNG: ${asset.path}`)
    } else if (
      extension === 'webp' &&
      (!data.subarray(0, 4).equals(Buffer.from('RIFF')) || !data.subarray(8, 12).equals(Buffer.from('WEBP')))
    ) {
      throw new Error(`不是有效 WebP: ${asset.path}`)
    } else if (extension === 'svg' && !data.toString('utf8').trimStart().startsWith('<svg')) {
      throw new Error(`不是有效 SVG: ${asset.path}`)
    }
    const destination = join(versionDirectory, asset.path)
    mkdirSync(join(destination, '..'), { recursive: true })
    copyFileSync(asset.sourcePath, destination)
    return {
      path: asset.path,
      group: asset.group,
      source: asset.source,
      license: asset.license,
      types: asset.types,
      sha256: createHash('sha256').update(data).digest('hex'),
      status: 'ACTIVE' as const,
    }
  }

  private assertVersion(version: string) {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}@\d+$/i.test(version))
      throw new Error('resourceVersion 必须使用 name@integer 格式')
  }
}
