# 行为验证码图库规范

本文档统一定义行为验证码图片资源的分类、数量、AI 生成约束、环境差异、审核和版本发布规则。

图库不是安全密钥。答案集合、点击顺序和旋转目标始终由服务端生成并保存在 Redis 中。

## 1. 资源目录和版本

AI 生成的图片不放在长期使用的 `ai/` 临时目录，也不与旧的线上样例图库混用。审核通过后进入不可变版本目录：

```text
resources/captcha/
├── versions/
│   ├── grid-ai@1/
│   │   ├── manifest.json
│   │   ├── grid/cats/*.jpg
│   │   ├── grid-target/cats/target.svg
│   │   ├── grid/firetrucks/*.jpg
│   │   ├── click-order/traffic-signs/*.jpg
│   │   └── rotate/directional-objects/*.jpg
│   └── grid-ai@2/
└── active.json
```

`active.json` 只保存当前生效版本目录。已经签发的 Challenge 继续使用创建时的 `ResourceVersion`，发布新版本不会覆盖旧文件。

代码入口：[`src/captcha/services/resource.catalog.ts`](../src/captcha/services/resource.catalog.ts)、[`src/captcha/services/resource.publisher.ts`](../src/captcha/services/resource.publisher.ts)。

## 2. 开发环境与生产环境

### 2.1 开发环境

目标是验证协议、SDK Renderer、刷新和校验流程，优先节省磁盘和构建时间：

| 项目 | 开发环境建议 |
|---|---:|
| `GRID_IMAGE_SELECT` 类别 | 4 类 |
| 每类图片 | 4～12 张 |
| `CLICK_ORDER` 类别 | 2～3 类 |
| 每类序列 | 10～20 组 |
| `ROTATE` 类别 | 2～3 类 |
| 每类图片 | 6～12 张 |
| 单文件大小 | ≤300 KB |
| 最大边长 | 512 px |
| 图片格式 | JPEG/WebP；目标线稿可使用 SVG |
| 版本 | `dev@N`，允许本地替换但不提交生产版本 |

开发环境允许减少类别和数量，但必须保留每种题型至少一组可运行资源。未命中资源时可以回退到 SVG，不能在生产环境启用该回退。

### 2.2 生产环境

目标是降低重复率、避免背景成为分类捷径，并支持版本轮换：

| 题型 | 类别数量 | 每类资源 | 总量建议 | 每题使用 |
|---|---:|---:|---:|---:|
| `GRID_IMAGE_SELECT` | ≥12，推荐 16～20 类 | ≥50，推荐 80～120 张 | 800～2,000 张 | 9 格，3 正确 + 6 干扰 |
| `CLICK_ORDER` | ≥8，推荐 10～12 类 | 每类 50～100 组序列 | 500～1,000 个目标 | 6～8 个目标 |
| `ROTATE` | ≥8，推荐 10～12 类 | ≥30，推荐 50～80 张 | 400～800 张 | 1 张，随机角度 |
| `SLIDER` | 不分类 | 100～200 张背景 | 100～200 张 | 1 张背景 + 服务端缺口 |

生产环境建议保留至少两个可轮换版本，禁止覆盖已发布版本。

## 3. 图片大小和压缩策略

AI 输出不能直接进入图库，必须经过预处理：

| 项目 | 开发环境 | 生产环境 |
|---|---:|---:|
| 最大边长 | 512 px | 800 px |
| 单文件上限 | 300 KB | 2 MB |
| 推荐 JPEG 质量 | 70～78 | 78～85 |
| 推荐 WebP 质量 | 70～80 | 78～85 |
| EXIF | 必须删除 | 必须删除 |
| 透明 PNG | 不建议 | 默认禁止 |

九宫格实际展示尺寸较小，不需要保存 2K 或 4K 原图。生产环境推荐先裁剪主体、统一最长边，再转 JPEG/WebP。目标图使用与类别一一对应的黑白线稿，可采用 SVG 以减少体积；不得用纯色几何占位图代替真实类别线稿。Challenge 不应以内嵌 Base64 返回大图，生产环境应使用短期签名地址或受控 CDN。

### 3.1 九宫格目标线稿

`GRID_IMAGE_SELECT` 每个类别必须至少有一张独立目标线稿，路径为 `grid-target/<group>/target.svg`。线稿只用于提示用户识别类别，不作为答案密钥；正确的 3 张图片和 6 张干扰图片仍由服务端保存在 Challenge 中。线稿应满足：

- 与候选图片类别语义一致，例如猫、消防车、披萨、向日葵；
- 白底、深色轮廓、主体居中、无文字、无品牌和无水印；
- 不复用候选图片，不暴露正确索引或文件名；
- 通过资源清单记录 SHA-256，并随资源版本原子发布；
- 仅允许 `image/svg+xml` 作为目标提示图，候选图片仍遵循 JPEG/WebP 压缩规范。

## 4. 类别规划

### 4.1 `GRID_IMAGE_SELECT`

推荐类别：

```text
cats, dogs, firetrucks, buses, cars, bicycles, motorcycles,
aircraft, boats, traffic-lights, traffic-signs, pizza,
cakes, fruits, flowers, backpacks, umbrellas, shoes
```

每个类别必须包含不同主体、不同角度、不同距离和不同真实背景。正确选项不能复制同一张图片，也不能只通过文件名、颜色或固定背景区分。

### 4.2 `CLICK_ORDER`

顺序题必须有明确规则，不能让 AI 或客户端临时判断“哪个更大”或“哪个更复杂”。推荐类别：

```text
traffic-sign-shape, geometric-shapes, vehicle-size,
tool-length, fruit-size, object-height, color-sequence,
symbol-complexity
```

每个目标在 manifest 中记录服务端顺序字段：

```json
{
  "assetId": "sequence-0001",
  "sequenceGroup": "geometric-shapes",
  "order": 3
}
```

客户端只提交点击索引，服务端根据 Challenge 中保存的 `order` 严格比较。

### 4.3 `ROTATE`

当前 SDK 的显示画布为 300 × 180px，旋转图片为 170 × 170px；候选原图不必制作成该显示尺寸，由服务端缩放并烘焙随机偏转。画布浅灰蓝背景与圆形底盘由 CSS 生成，保持静止。详见 [SDK_UI_SPEC.md](SDK_UI_SPEC.md)。

推荐类别：

```text
arrows, cars, buses, boats, aircraft, bicycles,
traffic-signs, wind-turbines, road-vehicles, directional-objects
```

只使用有明确前后、上下或指向的物体。圆形、完全对称、没有明确方向的物体不得进入旋转图库。

## 5. AI 生成提示词约束

以下硬性约束必须写入 AI 提示词：

```text
生成真实环境中的摄影图，不使用纯色背景、渐变背景或棚拍背景。
背景必须具有真实场景纹理，例如室内房间、木桌、石材、草地、道路、建筑、港口或公园。
同一类别的不同图片必须使用不同场景、角度、光照和构图，不能重复背景模板。
主体必须清晰，在 96x96 像素缩略图中仍可识别。
禁止文字、水印、Logo、人脸、车牌、敏感地点、包装品牌和可识别个人信息。
输出后必须移除 EXIF 等非必要元数据，并压缩到当前环境的大小限制。
```

题型追加约束：

- `GRID_IMAGE_SELECT`：同类多张不同主体，异类干扰图也必须使用真实背景；
- `CLICK_ORDER`：目标必须有可验证的排序属性，顺序由 manifest 元数据定义；
- `ROTATE`：主体必须有明确方向，背景可以复杂但不能遮挡方向特征；
- `SLIDER`：真实照片只作为背景，缺口位置和答案由服务端随机生成。

## 6. AI 生成接口

AI 只生成候选图片，不能直接决定生产答案：

```ts
interface AiCaptchaImageProvider {
  generate(request: AiCaptchaImageRequest): Promise<GeneratedCaptchaAsset[]>
}
```

生成请求必须支持环境配置：

```ts
type ResourceEnvironment = 'development' | 'production'

type AiCaptchaImageRequest = {
  environment: ResourceEnvironment
  groups: string[]
  assetsPerGroup: number
  maxWidth: number
  maxHeight: number
  maxBytes: number
  promptVersion: string
}
```

每个返回资源必须包含暂存路径、相对路径、类别、适用题型、生成模型、提示词版本、生成时间、许可证和人工审核状态。

## 7. 发布和版本更新

```ts
const publisher = new ResourcePublisher('/srv/captcha/resources/captcha')

await publisher.generateAndPublish(
  provider,
  {
    environment: 'production',
    groups: ['cats', 'firetrucks', 'pizza', 'sunflowers'],
    assetsPerGroup: 80,
    maxWidth: 800,
    maxHeight: 800,
    maxBytes: 2 * 1024 * 1024,
    promptVersion: 'captcha-real-background-v2',
  },
  'grid-ai@2'
)
```

发布过程必须校验版本号、格式、大小、路径、文件头、重复率、许可证、隐私和人工审核记录，计算 SHA-256 后写入新的 `versions/<resourceVersion>`，最后原子切换 `active.json`。

开发版本和生产版本必须使用不同的资源目录与版本号，禁止把开发资源直接标记为生产 `ACTIVE`。

## 8. 发布前验收

- 缩小到 SDK 九宫格尺寸后仍可识别；
- 同类图片不存在重复文件或近似重复构图；
- 背景不是固定纯色、固定模板或类别捷径；
- 正确选项不能通过文件名、URL、alt 或隐藏 DOM 推断；
- 目标类别和干扰类别分布均衡；
- `CLICK_ORDER` 的顺序由服务端元数据决定；
- `ROTATE` 的方向特征清晰且目标角度只保存在 Challenge；
- 刷新后旧 Challenge 失败；
- 过期、并发 Verify、资源缺失和 Redis 故障均安全失败；
- 通过后才允许切换为 `ACTIVE`。

## SDK 固定界面资源

`sdk/assets/load-failed.svg` 是固定 UI 提示图，包含“请稍后再试”文案，用于加载、资源失败和刷新限频，不属于验证码候选图库，不携带答案，也不作为题目降级资源。其展示尺寸及加载动画由 [SDK_UI_SPEC.md](SDK_UI_SPEC.md) 规定。
