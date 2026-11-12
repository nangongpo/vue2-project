# captcha-service 验证码类型与 SDK Renderer 规范

本文档定义验证码题型、适用展示模式、服务端引擎、前端 SDK Renderer、Payload 和校验规则。风险决策、Attempt/Session 绑定、Token 消费和业务场景流程以 [`REQUIREMENTS.md`](REQUIREMENTS.md) 为准。

界面尺寸、提示文案、交互细节、加载/失败视图与计时的统一规范见 [SDK_UI_SPEC.md](SDK_UI_SPEC.md)。

图片资源的生产类别、数量、AI 生成约束、开发/生产环境差异和版本发布流程以 [`CAPTCHA_RESOURCES.md`](CAPTCHA_RESOURCES.md) 为准。

## 1. 类型和展示模式

展示模式与验证码类型分别声明，但必须符合下述适用模式约束；初始化、加载、刷新和替换 Challenge 均必须校验，不能混用：

```ts
type CaptchaMode = 'EMBED' | 'POPUP'

type CaptchaType =
  | 'SIMPLE_SLIDER'
  | 'SLIDER'
  | 'ROTATE'
  | 'GRID_IMAGE_SELECT'
  | 'CLICK_ORDER'
  | 'TEXT_SELECT'
  | 'AUDIO'
```

| 类型 | 主要交互 | 允许模式 | 适用风险 | 说明 |
|---|---|---|---|---|
| `SIMPLE_SLIDER` | 拖动到最左边 | `EMBED` | 低风险 | 低摩擦行为题，不是拼图题 |
| `SLIDER` | 拖动拼图到缺口 | `POPUP` | 低到中风险 | 服务端校验位置和轨迹 |
| `ROTATE` | 旋转图片到目标角度 | `POPUP` | 中风险 | 服务端保存目标角度 |
| `GRID_IMAGE_SELECT` | 九宫格多选匹配图片 | `POPUP` | 中到高风险 | 选择集合，顺序无关 |
| `CLICK_ORDER` | 按指定顺序点击 | `POPUP` | 中到高风险 | 选择顺序必须严格匹配 |
| `TEXT_SELECT` | 文字选择或输入 | `POPUP`（规划） | 降级、无障碍 | 尚未实现，不加入当前场景白名单 |
| `AUDIO` | 音频听辨或输入 | `POPUP`（规划） | 无障碍备用 | 尚未实现，必须绑定同一 Challenge |

### 统一画布与坐标

`SLIDER`、`ROTATE`、`GRID_IMAGE_SELECT`、`CLICK_ORDER` 的题面固定为 **300 × 180 px**，Payload 必须携带 `canvasWidth: 300`、`canvasHeight: 180`，SDK 拒绝其他尺寸。标题、操作条和底部按钮不计入题面尺寸。`CAPTCHA_CANVAS_WIDTH` / `CAPTCHA_CANVAS_HEIGHT` 不再覆盖固定尺寸。

拼图坐标以该画布的原生像素计算，滑轨位移按有效行程映射为拼图横坐标；顺序点击的 x/width 按 300px、y/height 按 180px 换算百分比。背景完整铺满相同画布，不使用 cover 裁切。旋转图居中于 300 × 180px 画布，内部圆形图片为 170 × 170px。九宫格为三行三列，含间隙总尺寸仍为 300 × 180px。

### 1.1 EMBED

`EMBED` 由业务提供容器，SDK 直接渲染低摩擦题型。默认使用：

```text
请按住滑块，拖动到最左边
```

约束：

- 当前只允许 `SIMPLE_SLIDER`；不得渲染拼图、旋转、九宫格或顺序点击题型；
- 不创建全屏遮罩和弹窗；
- SDK 负责加载、刷新、校验、状态和销毁；
- 高风险时 backend 返回 `UPGRADE_REQUIRED`，不得在 EMBED 中降低验证强度或继续放行；
- 当前 SDK 实例的模式固定，`open()` 不会把 EMBED 切换为 POPUP；升级时由业务关闭嵌入实例并使用 POPUP 实例加载服务端批准的新 Challenge。

### 1.2 POPUP

`POPUP` 由 SDK 创建弹窗，题型由服务端按照风险策略和场景白名单选择。

当前只允许 `SLIDER`、`ROTATE`、`GRID_IMAGE_SELECT`、`CLICK_ORDER`，禁止 `SIMPLE_SLIDER`。服务端选题时先取场景白名单与展示模式允许类型的交集，再应用权重；默认类型和零权重回退也必须来自该交集。交集为空或显式类型与模式冲突时拒绝请求，不跨模式降级。SDK 同时校验 Challenge 的模式与实例模式一致，并校验题型与模式兼容。

弹窗统一提供：

- 加载和校验状态；
- 刷新当前 Challenge；
- 关闭和重新打开；
- 失败重试和过期处理；
- 键盘焦点和无障碍替代入口；
- 资源错误和限流提示。

业务页面不能自行创建第二套验证码弹窗，也不能从前端指定一个更简单的题型。

## 2. 服务端引擎

每种题型实现独立的服务端引擎：

```ts
interface CaptchaEngine {
  readonly type: CaptchaType
  readonly version: string

  createChallenge(input: CreateChallengeInput): Promise<ChallengePayload>

  verifyChallenge(
    challenge: StoredChallenge,
    input: VerifyChallengeInput
  ): Promise<VerifyResult>

  validateClientPayload(payload: unknown): boolean
}
```

注册表：

```ts
class CaptchaEngineRegistry {
  register(engine: CaptchaEngine): void
  get(type: CaptchaType): CaptchaEngine
}
```

安全规则：

- 服务端根据风险决策选类型；
- 前端传入的 `captchaType` 只能作为展示声明，不能突破场景白名单；
- 每种类型使用独立的答案结构和校验器；
- 题型版本、资源版本和策略版本必须记录在 Challenge；
- 增加题型不能修改其他题型的答案解析逻辑；
- 任何类型成功后都只能签发统一的一次性 `CaptchaToken`。

## 3. `SIMPLE_SLIDER`

### 3.1 交互

用户按住初始位于右端的滑块，将其拖动到最左侧目标位置。题目不展示拼图缺口，仅允许 `EMBED`。SDK 和服务端共同拒绝 `POPUP + SIMPLE_SLIDER`。简单滑块单独使用 `renderers/simple-slider.js`，拼图使用 `renderers/slider.js`；仅共享底层 Pointer Events 拖动采集工具 `renderers/drag.js`。

### 3.2 服务端状态

```ts
type SimpleSliderChallenge = {
  captchaType: 'SIMPLE_SLIDER'
  trackWidth: number
  buttonWidth: number
  targetX: number
  createdAt: number
  contextHash: string
}
```

`targetX`、允许误差、轨迹规则和上下文只保存在服务端。即使目标通常是最左侧，也不能只在浏览器检查 `finalX === 0`。

### 3.3 客户端载荷

```json
{
  "finalX": 0,
  "trackWidth": 360,
  "points": [
    { "x": 318, "y": 20, "t": 0 },
    { "x": 286, "y": 20, "t": 100 },
    { "x": 254, "y": 20, "t": 200 },
    { "x": 223, "y": 20, "t": 300 },
    { "x": 191, "y": 20, "t": 400 },
    { "x": 159, "y": 20, "t": 500 },
    { "x": 127, "y": 20, "t": 600 },
    { "x": 95, "y": 20, "t": 700 },
    { "x": 64, "y": 20, "t": 800 },
    { "x": 32, "y": 20, "t": 900 },
    { "x": 0, "y": 20, "t": 1000 }
  ]
}
```

服务端校验：坐标范围、轨道宽度、点数、时间递增、持续时间、异常跳跃、重复提交、最终位置和上下文绑定。

## 4. `SLIDER`

`SLIDER` 是拼图缺口题，与 `SIMPLE_SLIDER` 完全分开。

服务端保存：

```ts
type SliderChallenge = {
  captchaType: 'SLIDER'
  canvasWidth: number
  canvasHeight: number
  trackWidth: number
  buttonWidth: number
  pieceSize: number
  targetX: number
  targetY: number
  resourceVersion: string
}
```

手柄仅向右指示，松开后自动提交；背景 SVG 不带圆角，具体外观见 [界面规范](SDK_UI_SPEC.md#5-各题型交互)。校验最终横坐标、轨迹合理性、资源版本、Challenge 上下文和一次性状态。图片和缺口位置是公开题目资源，不是安全密钥。

## 5. `ROTATE`

用户拖动角度控制条，将偏转图片旋转为正向朝上。服务端使用 sharp 把随机偏转烘焙到 PNG 像素中，目标恢复角度只存 Redis，不返回原图、目标角度或含偏转参数的 SVG。SDK 根据 `initialAngle`、`rotationStep`、`minAngle`、`maxAngle` 渲染控制条并实时更新图片旋转，change 时自动提交，不显示确定按钮；CSS 背景和底盘保持静止。

```json
{
  "image": "data:image/png;base64,...",
  "rotationStep": 1,
  "initialAngle": 0,
  "minAngle": 0,
  "maxAngle": 359
}
```

服务端保存 `targetAngle`，客户端只能提交最终角度和受限的交互元数据：

```json
{
  "finalAngle": 181,
  "interactions": [
    { "angle": 120, "t": 480 },
    { "angle": 181, "t": 921 }
  ]
}
```

服务端必须规范化角度、检查误差范围、角度变化和 Challenge 绑定，不能信任客户端“已对齐”标记。

## 6. `GRID_IMAGE_SELECT`

这是九宫格多选图像题：用户根据目标图选择所有匹配的候选图片。选择达到 requiredCount 后自动提交；支持取消选择，不显示已选数量。

`targetImage` 必须是服务端维护的轻量线框图标，用于表示目标类别；不能使用 AI 生成的摄影图、九宫格候选图或带文字的图片。候选九宫格仍使用真实场景图片，目标线框图与候选类别一一对应。当前 SDK 弹窗尺寸固定为 `318px × 318px`，题面和底栏按统一弹窗布局显示，提示覆盖画布底部，避免不同题型导致弹窗跳动。

```json
{
  "grid": { "rows": 3, "columns": 3 },
  "prompt": "选择 3 个符合右图的图片",
  "targetImage": "opaque-target-resource",
  "tiles": [
    { "index": 0, "image": "opaque-tile-resource-0" },
    { "index": 1, "image": "opaque-tile-resource-1" }
  ],
  "requiredCount": 3
}
```

服务端只保存答案集合或资源 ID 映射，不返回答案：

```json
{
  "selectedIndexes": [0, 4, 8],
  "interactions": [
    { "index": 0, "action": "SELECT", "t": 412 },
    { "index": 4, "action": "SELECT", "t": 731 },
    { "index": 8, "action": "SELECT", "t": 1022 }
  ]
}
```

服务端必须：

- 去重并检查 index 是否越界；
- 检查选择数量和答案集合；
- 按集合比较，不依赖选择顺序；
- 拒绝重复提交、跨 Challenge index 和旧资源版本；
- 不使用图片 URL、文件名、alt 文本或隐藏 DOM 作为答案；
- 与风险评分、限流、一次性 Challenge 和 MFA 组合使用。

图片资源不是安全密钥，即使被下载也不能换取有效 Token。图像题不能作为唯一无障碍路径。

## 7. `CLICK_ORDER`

用户必须按照服务端指定顺序点击目标区域，再点击确定提交。支持撤销、重新编号并限制选择数量；提示图标和点击框须按可见图形中心对齐。

```json
{
  "prompt": "请在下图依次点击",
  "backgroundImage": "opaque-background-resource",
  "sequenceTargets": [
    { "image": "opaque-target-icon-1" },
    { "image": "opaque-target-icon-2" },
    { "image": "opaque-target-icon-3" }
  ],
  "targets": [
    { "index": 0, "x": 9, "y": 10, "width": 18, "height": 24, "image": "opaque-resource-0" },
    { "index": 1, "x": 39, "y": 12, "width": 18, "height": 24, "image": "opaque-resource-1" }
  ]
}
```

`sequenceTargets` 只描述需要依次识别的目标图标，`targets` 描述大图中的可点击区域和坐标。答案集合、目标顺序与坐标绑定关系仍只保存在服务端 Challenge 中，浏览器只能提交点击索引。

文字点选是 `CLICK_ORDER` 的一种资源变体：`sequenceTargets` 展示需要点击的文字，背景图中提供对应文字目标和点击区域。它仍然使用相同的顺序校验、一次性 Challenge 和服务端答案绑定，不新增一套可绕过的校验逻辑；文字必须由服务端生成或审核，不能从文件名、隐藏文本或前端答案字段推断。

客户端提交：

```json
{
  "selectedIndexes": [2, 0, 1]
}
```

服务端按顺序严格比较。`CLICK_ORDER` 不能复用 `GRID_IMAGE_SELECT` 的集合比较逻辑。

## 8. `TEXT_SELECT` 和 `AUDIO`

这两类是替代和无障碍路径，不是“低安全等级的绕过入口”。

- Challenge 必须重新生成或切换到明确的替代资源；
- 答案仍只保存在服务端；
- Token 仍绑定同一个 Attempt、Session、动作和资源范围；
- 替代流程不能通过降低风险策略来绕过 MFA 或敏感操作限制；
- 音频资源和答案不能通过静态 URL、字幕或前端变量泄露。

## 9. SDK Renderer 规范

SDK 源码按职责拆分，入口文件不承载题型、DOM、状态或协议逻辑：

```text
sdk/captcha.js              # 公共 SDK 导出入口
sdk/core.js                 # 状态机、生命周期、Challenge/Verify 编排
sdk/validation.js           # 初始化参数、Challenge Envelope、Answer 校验
sdk/dom.js                  # 样式、DOM、事件作用域
sdk/renderers/              # slider、grid、click-order、rotate 等题型 Renderer
sdk/constants.js            # 模式、题型、状态常量
sdk/errors.js               # 结构化 SDK 错误
```

新版 SDK 初始化契约是严格的：

```ts
type CaptchaSdkOptions = ({
  mode: 'EMBED'
  container: HTMLElement       // EMBED 必填
} | {
  mode: 'POPUP'
  container?: never             // POPUP 禁止传入
}) & {
  loadChallenge: (previous: ChallengeEnvelope | null) => Promise<ChallengeEnvelope> // 必填
  verify: (answer: CaptchaAnswer, challenge: ChallengeEnvelope) => Promise<VerifyResult> // 必填
  onSuccess?: (result: VerifyResult) => void
  onFail?: (error: CaptchaSdkError, context: { phase: 'load' | 'verify' }) => void
  onClose?: () => void
  onEvent?: (event: CaptchaSdkEvent) => void
}
```

`ChallengeEnvelope` 还必须包含 backend 为本次业务流程生成的 `attemptId`。SDK 必须在标准化时保留该字段，并在 `verify(answer, challenge)` 回调中原样交给业务 API；不得由浏览器自行生成、修改或从验证请求中省略。

首次加载和关闭后重新打开时 `previous` 为 `null`。刷新时传入旧 Challenge；业务回调必须将 `attemptId` 和 `previousChallengeId: previous.challengeId` 一并交给 backend 的创建接口。backend 校验用户、场景、动作、模式和有效期，并以签名字段 `PreviousChallengeId` 调用内部创建接口；不能自行新建 Attempt 代替刷新。

以下字段不能由 SDK 使用默认值补齐：`mode`、`loadChallenge`、`verify`、ChallengeId、SceneId、CaptchaType、Mode、TypeVersion、ResourceVersion、ExpiresIn 和题型 Payload 必填字段。SDK 不接收或生成 `Operation`、`Action`、`ServiceId`、`Signature` 等内部协议字段；这些字段只能由 backend 服务端生成和签名。

Verify 正式接口只接受题型对应的完整 `Answer`。旧的 `Points`、`FinalX`、`TrackWidth` 组合不属于正式协议，服务端应拒绝混用或缺字段请求。

```ts
interface CaptchaRenderer {
  mount(container: HTMLElement, challenge: Challenge): void
  reset(): void
  destroy(): void
  getPayload(): unknown
  setBusy(busy: boolean): void
  focus(): void
}
```

题型与状态视图文件：

```text
renderers/
├── simple-slider.js
├── slider.js
├── drag.js                 # 共享拖动输入工具，不是题型 Renderer
├── rotate.js
├── grid.js
├── click-order.js
├── loading.js
└── load-error.js
```

Renderer 只负责展示和采集交互，不负责：

- 判断答案；
- 计算风险；
- 签发 Token；
- 修改业务登录状态；
- 调用 captcha-service 内部接口。

所有 Renderer 必须支持：

- 明确的 `mount/reset/destroy` 生命周期；
- 加载和提交中的 busy 状态；
- 请求竞态保护；
- 资源加载失败处理；
- 键盘焦点和可访问状态；
- 事件监听器清理；
- 不把答案写入 DOM、URL、localStorage 或日志。

滑块类使用 Pointer Events 和 `setPointerCapture`；九宫格类必须支持选择、取消选择、选中标记和键盘焦点，但不显示已选数量；顺序点击类必须显示当前顺序状态但不能显示正确答案。

## 10. 刷新、替换和失败

所有类型共享同一生命周期：

```text
ACTIVE -> VERIFIED
ACTIVE -> FAILED
ACTIVE -> REPLACED
ACTIVE -> EXPIRED
```

刷新时：

1. SDK 销毁旧 Renderer；
2. backend 校验同一 Attempt、用户、场景、动作、模式和有效期，已验证流程不能刷新；
3. captcha-service 在 Redis 原子校验活动 Challenge、检查刷新上限（`CAPTCHA_REFRESH_LIMIT`，默认 10 次）、发布新题并删除旧题；并发刷新只能一个成功；
4. 服务端在当前展示模式允许的场景题型中重新选择题型和资源，POPUP 不得选到 `SIMPLE_SLIDER`，当前 EMBED 始终为 `SIMPLE_SLIDER`；
5. SDK 挂载新 Renderer。

不能只在客户端替换图片或清空选择状态。旧 Challenge 必须无法再次校验。SDK 在刷新、替换、关闭、销毁和过期后忽略旧验证响应；提交期间禁止重复提交，图片加载失败和过期会阻止继续作答并提示刷新。服务端验答成功时原子消费活动 Challenge，只有一个并发请求可以获得 Token。

## 11. 新增题型清单

新增题型必须同时完成：

1. `CaptchaType` 和场景白名单；
2. 服务端 Engine 和独立答案校验器；
3. Challenge Payload Schema；
4. Redis 状态和版本字段；
5. SDK Renderer；
6. EMBED/POPUP 适用模式；
7. 键盘和无障碍替代方案；
8. 限流、重放和刷新测试；
9. 服务端并发消费测试；
10. README 和架构文档更新。

未完成服务端校验、一次性消费和安全测试的题型不能加入生产场景白名单。

## 12. 界面与交互验收

统一遵守 [SDK_UI_SPEC.md](SDK_UI_SPEC.md)，包括 318 × 318px 弹窗、300 × 180px 画布、题型操作区、单一提示、成功耗时与停留、加载动画和失败/限频展示。不在此重复维护尺寸和样式明细。
