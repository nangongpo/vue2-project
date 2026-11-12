# captcha-service 架构与安全基线

本文档是 `captcha-service` 的唯一架构、安全、协议和验收基线。实现、前端 SDK、backend 适配层和部署配置必须遵守本文档；与便利性冲突时，以安全性和可访问性为准。

验证码题型、Payload、服务端 Engine 和 SDK Renderer 的详细实现规范单独维护在 [`CAPTCHA_TYPES.md`](CAPTCHA_TYPES.md)。本文档只保留场景、风险、安全边界和跨类型的通用约束。当前界面与交互验收以 [SDK_UI_SPEC.md](SDK_UI_SPEC.md) 为准；下文无障碍替代和评分式能力中尚未实现的部分属于架构目标，不代表可用功能。

## 1. 目标与非目标

### 1.1 目标

- 为多个 backend 提供可复用的一次性验证码和风险评估能力。
- 支持评分式、按业务动作分级的风控，减少低风险用户的不必要交互。
- 支持多种验证码类型、服务端权重轮换、用户刷新和无障碍替代流程。
- 保证 Challenge、Assessment 和 CaptchaToken 的上下文绑定、短期有效和一次性消费。
- 让业务页面只依赖稳定的 backend API 和独立 Web SDK，不感知内部服务协议。

### 1.2 非目标

- 不实现登录、用户、角色、权限、会话或业务数据库。
- 不把风险评分当作身份认证，不以验证码替代密码、MFA 或授权检查。
- 不让浏览器直接调用 `captcha-service`。
- 不依赖客户端上报的行为事件单独决定认证放行。
- 不保证任何验证码可以永久阻止自动化；验证码只是风控链路中的一个条件。

评分式风险处置参考 [Google reCAPTCHA Enterprise 的官方建议](https://docs.cloud.google.com/recaptcha/docs/choose-key-type)：根据风险评分、原因码和业务动作选择处置，而不是所有请求强制使用同一种 CAPTCHA。评分只能帮助决定是否增加交互，不能替代后端身份认证。

## 2. 运行环境

仓库根目录的 `.nvmrc` 是 Node.js 版本基线。执行开发、构建或测试前必须先切换环境：

```bash
nvm use
```

## 3. 场景分类、触发条件和标准流程

行为验证码不是一个“登录弹窗组件”，而是由 backend 风控决定是否需要交互、由 SDK 负责展示、由 captcha-service 负责最终校验的一组流程。所有场景都必须先确定业务动作，再确定风险决策和验证码强度。

### 3.1 场景总览

| 场景 | 触发条件 | SDK 模式 | 默认题型/动作 | 验证成功后的范围 |
| --- | --- | --- | --- | --- |
| A. 登录低风险 | 风险低、上下文正常 | 不展示 | `ALLOW` | 仅允许当前 Attempt 继续登录 |
| B. 登录内嵌验证 | 页面需要低摩擦验证 | `EMBED` | `SIMPLE_SLIDER` | 仅允许当前登录 Attempt |
| C. 登录强验证 | 风险中高、内嵌验证不足 | `POPUP` | 服务端随机选择 | 仅允许当前登录 Attempt，必要时继续 MFA |
| D. 已登录异常读数据 | Session 已登录但读取行为异常 | `POPUP` | 随机交互题 | 仅允许当前 Session/资源范围短暂继续读取 |
| E. 导出/敏感操作 | 导出、批量下载或高敏感写操作 | `POPUP` + MFA/审批 | 强交互题 | 只允许当前动作，不得转换为其他权限 |
| F. 刷新、过期、失败 | 用户主动刷新、超时或校验失败 | 保持原模式 | 新 Challenge | 旧 Challenge 永久失效 |
| G. 风控依赖异常 | Redis、评分或验证码服务不可用 | 不放行 | 安全失败 | 返回错误或进入人工恢复流程 |
| H. 无障碍替代 | 键盘、视觉或输入能力受限 | `EMBED`/`POPUP` | `TEXT_SELECT`/`AUDIO` | 仍绑定原 Attempt 和业务动作 |

### 3.2 统一状态机

业务流程、验证码流程和 Token 流程必须分开管理：

```text
Attempt:   CREATED -> ASSESSED -> CAPTCHA_REQUIRED -> VERIFIED -> CONSUMED/EXPIRED
Challenge: ACTIVE -> VERIFIED | FAILED | REPLACED | EXPIRED
Token:     ISSUED -> CONSUMED | EXPIRED
Session:   NORMAL -> MONITORED -> CHALLENGE_REQUIRED -> RESTRICTED/REVOKED
```

任何状态只能由服务端推进。SDK 的 `open`、`close`、`refresh` 和 Promise 结果不能直接修改业务认证状态。

### 3.3 场景 A：登录低风险，不展示验证码

**触发条件**

- backend 已生成新的 Attempt；
- 风险评分低于当前 `ALLOW` 阈值；
- 账号、IP、设备和请求频率没有异常；
- 当前动作是 `LOGIN`，不是密码重置或敏感操作。

**流程**

```text
登录请求
  -> backend 创建 Attempt
  -> captcha-service 进行 Assessment
  -> Decision=ALLOW
  -> backend 保存短期 ALLOW 状态
  -> SDK 返回 SKIPPED
  -> 前端提交登录
  -> backend 重新检查 Attempt、密码、MFA 和账号状态
```

**实现要求**

- `SKIPPED` 不能直接代表登录成功；
- 浏览器删除 `captchaToken` 不能改变 backend 的 Attempt 状态；
- Attempt 必须绑定规范化主体、动作、场景和过期时间；
- 登录接口不能接受前端提交的 `decision=ALLOW` 作为依据；
- 风险 Assessment 过期后必须重新评估。

### 3.4 场景 B：登录内嵌简单验证

**触发条件**

- 业务希望在登录表单中始终展示低摩擦验证；或
- 风险处于低到中区间，策略允许 `EMBED`；
- backend 允许的题型集合包含 `SIMPLE_SLIDER`。

**流程**

```text
页面创建 SDK(EMBED)
  -> SDK 请求 backend 创建/获取 Challenge
  -> backend 固定 action=LOGIN 并保存 Attempt
  -> captcha-service 生成 SIMPLE_SLIDER
  -> 用户拖动到最左边
  -> SDK 提交轨迹和最终位置
  -> 服务端校验并签发 CaptchaToken
  -> 前端提交登录
  -> backend ConsumeToken 后继续登录
```

**实现要求**

- `SIMPLE_SLIDER` 只表示简单行为题，不等于拼图 `SLIDER`；
- SDK 使用 Pointer Events、键盘控制和轨迹采集；
- 最终位置、耗时和轨迹必须由服务端校验；
- 客户端不能把“拖到了最左边”作为成功标记直接回调业务；
- 高风险时 backend 返回 `UPGRADE_REQUIRED`，不能在内嵌模式继续放行；
- 业务必须明确调用 `open()` 升级到 Popup，或停止本次登录。

### 3.5 场景 C：登录强验证弹窗

**触发条件**

- `STRONG_CHALLENGE` 或 `STEP_UP`；
- 内嵌简单验证失败或不足；
- 多次登录失败、设备变化、IP 风险或自动化信号命中。

**流程**

```text
backend 返回 CAPTCHA_REQUIRED
  -> SDK.open({ source: 'LOGIN_RISK', action: 'LOGIN' })
  -> backend 再次校验 Attempt 和风险上下文
  -> captcha-service 按策略随机选择题型
  -> SDK 创建 Popup
  -> 用户验证、刷新或关闭
  -> 服务端 VerifyChallenge
  -> 成功签发 CaptchaToken
  -> 前端提交登录
  -> backend ConsumeToken
  -> 如 decision=STEP_UP，继续 MFA
```

**实现要求**

- 随机题型由服务端决定，前端不能指定更简单的题型；
- Popup 的刷新必须废弃旧 Challenge 并生成新 Challenge；
- 关闭弹窗返回 `CLOSED`，不能被当作成功；
- 验证成功后仍需执行密码、MFA、账号状态和权限检查；
- 题型资源失败时只能重试或切换到服务端允许的替代题型。

### 3.6 场景 D：已登录用户异常读取数据

**触发条件**

登录成功后，backend 在数据接口层持续监测：

- 单位时间请求量或返回记录数异常；
- 并发请求和分页推进过快；
- 短时间跨越大量用户、部门、租户或资源范围；
- 同一 Session 的 IP、设备或 User-Agent 突然变化；
- 重复游标、无效分页、越权探测或固定时间间隔访问；
- `DATA_READ` 请求持续超过正常用户基线。

**流程**

```text
数据读取请求
  -> backend 先做权限检查和访问统计
  -> 风险达到 DATA_READ 阈值
  -> 暂停本次数据响应
  -> 返回 CAPTCHA_REQUIRED + opaque riskContext
  -> SDK.open({ source: 'BUSINESS_RISK', action: 'DATA_READ' })
  -> Popup 完成验证
  -> backend 验证短期、限定范围的 Token
  -> 原请求重新执行完整权限检查
  -> 只恢复有限数据读取能力
```

**实现要求**

- 必须在返回下一批敏感数据之前触发，不应等大量数据已经泄露后再弹窗；
- 风险统计由 backend 从真实请求和响应生成，不信任客户端计数；
- 验证 Token 绑定 `userId`、`sessionId`、`action=DATA_READ`、资源范围和过期时间；
- `DATA_READ` Token 不能用于导出、写操作、登录或其他接口；
- 验证通过后仍然保留分页、并发、速率和资源范围限制；
- 持续异常时可升级为 MFA、Session 暂停、Session 撤销或安全告警。

### 3.7 场景 E：导出、批量下载和敏感操作

这类操作不能只依赖行为验证码。即使验证码通过，也必须根据业务规则执行 MFA、审批、导出配额和字段脱敏。

```text
导出请求
  -> 权限检查
  -> 风险评估 action=DATA_EXPORT
  -> CAPTCHA_REQUIRED
  -> POPUP 强验证
  -> MFA 或审批
  -> 重新确认导出范围和字段
  -> 签发仅限本次导出的短期授权
  -> 执行一次性导出
```

导出授权必须绑定导出条件、资源范围、过滤器摘要、用户、Session、审批单和过期时间，不能把普通 `DATA_READ` 验证结果升级为导出权限。

### 3.8 场景 F：刷新、关闭、过期和失败

| 事件 | SDK 行为 | 服务端行为 | 业务结果 |
| --- | --- | --- | --- |
| 用户刷新 | 销毁 Renderer，获取新题 | 原子废弃旧 Challenge | 继续验证 |
| 用户关闭 | 销毁或隐藏 Popup | Challenge 保持短期不可直接消费或立即替换 | 暂停业务 |
| Challenge 过期 | 显示重新获取 | 标记 `EXPIRED` | 不放行 |
| 答案错误 | 展示错误并限制次数 | 累加失败，达到上限进入冷却 | 不放行 |
| Token 重复消费 | 返回失败 | 原子拒绝重放 | 不放行 |
| 资源加载失败 | 允许重试或切换题型 | 保持原 Challenge 不可直接成功 | 不放行 |

关闭、失败和网络异常不能被前端转换成 `VERIFIED`。

### 3.9 场景 G：依赖不可用

Redis、captcha-service、风险评估服务或必要的外部校验服务不可用时：

- 登录、导出、敏感操作和异常数据读取默认拒绝或保持受限；
- 返回 `503`、维护提示或人工恢复入口；
- 不使用客户端本地生成的“成功 Token”；
- 不因为验证码服务超时而自动放行管理后台；
- 记录脱敏故障事件并触发监控告警。

### 3.10 场景 H：无障碍和替代流程

- `EMBED` 提供键盘可操作的 `SIMPLE_SLIDER` 或 `TEXT_SELECT`；
- `POPUP` 提供键盘焦点管理、可访问状态提示和替代验证入口；
- 九宫格图像题不得作为唯一认证路径；
- 替代流程获得的 Token 仍绑定相同 Attempt、Session、动作和资源范围；
- 不因用户选择无障碍流程而降低服务端风险策略。

## 4. 信任边界与部署关系

```text
Browser -- HTTPS --> Project Backend -- HTTPS/mTLS + HMAC --> captcha-service -- Redis --> Redis
```

- Browser 只能访问项目 backend 的 `/api/v1/captcha/*` 和业务接口。
- backend 是浏览器唯一入口，负责生成 `AttemptId`、规范化主体、固定业务动作和保存流程状态。
- captcha-service 负责风险评估、Challenge、验证码引擎、一次性 Token、限流和安全事件。
- captcha-service 不访问用户表、权限表、业务数据库，也不调用 backend。
- Redis 是 captcha-service 的权威状态存储；Challenge、Assessment、Token、nonce 和限流状态不能依赖本地内存。
- 生产环境 captcha-service 和 Redis 不得暴露公网；backend 到 captcha-service 必须使用 HTTPS、证书校验、mTLS 或等价网络身份控制，并使用 HMAC 请求签名。
- 开发环境可使用回环 HTTP，但仍必须执行服务身份、签名、nonce、限流和 Redis 状态校验。

## 5. 核心对象和不可混淆的边界

### 4.1 Attempt

`AttemptId` 是 backend 为一次业务流程生成的短期流程句柄，不是登录凭证。

Attempt 必须绑定：

- 规范化后的主体标识，例如用户名哈希；
- 固定业务动作，例如 `LOGIN`；
- 固定场景，例如 `login`；
- 创建时间和过期时间；
- backend 保存的当前风险决策和流程状态。

### 4.2 Assessment

Assessment 是服务端风险评估结果，不是验证码通过凭证。

```ts
type RiskAssessment = {
  assessmentId: string
  attemptId: string
  action:
    | 'LOGIN'
    | 'REGISTER'
    | 'PASSWORD_RESET'
    | 'SENSITIVE_OPERATION'
    | 'DATA_READ'
    | 'DATA_EXPORT'
  riskScore: number       // 0-100，越高越危险
  confidence: number      // 0-1
  decision: RiskDecision
  reasons: RiskReasonCode[]
  expiresAt: number
}
```

Assessment 只返回给 backend；原始分数和原因码不得返回浏览器。backend 将决策写入自己的 Attempt 状态，并在最终业务请求中重新检查 Attempt 状态，不能相信浏览器提交的 `requiresCaptcha` 或 `decision`。

### 4.3 Challenge

Challenge 是一次具体验证码题目，包含题型、资源、答案上下文和校验上下文。

- ChallengeId 必须不可预测。
- 答案只能保存在 captcha-service 的服务端状态中。
- Challenge 与 Attempt、动作、场景、主体、可信客户端上下文绑定。
- Challenge 只能处于一个有效状态。
- Challenge 成功、失败达到上限、被刷新替换或过期后不可再次校验。

### 4.4 CaptchaToken

CaptchaToken 是验证码 Challenge 成功后签发的短期、一次性、不可预测 opaque token。

- Token 只代表“该 Challenge 已通过”，不代表登录成功。
- Token 必须绑定 Attempt、主体、动作、场景和必要的客户端上下文。
- Token 只能由 backend 通过内部 `ConsumeToken` 消费一次。
- 浏览器可以短暂携带 Token，但不得写入 URL、localStorage、日志、埋点或业务数据库。
- Token 消费失败、过期、重复消费或上下文不符时，业务请求必须失败。

### 4.5 三者关系

```text
Attempt 1 -- 0..1 --> Assessment
Attempt 1 -- 0..N --> Challenge（同一时间最多一个 ACTIVE）
Challenge 1 -- 0..1 --> CaptchaToken
CaptchaToken 1 -- 0..1 --> Consume
```

低风险时可以没有 Challenge 和 CaptchaToken，但 backend 必须拥有未过期、与 Attempt 绑定的服务端 `ALLOW` 决策。前端 SDK 返回 `SKIPPED` 只表示“无需展示验证码”，绝不等于“前端已经认证成功”。

## 6. 风险评估和分级处置

### 5.1 评分原则

风险评分必须由服务端计算。输入可以包括：

- 业务动作和场景；
- backend 可信传入的主体哈希、IP、User-Agent 哈希、设备上下文；
- 账号失败次数、刷新次数、校验失败次数和请求频率；
- Challenge 重放、Token 重放和上下文变化；
- 近期成功会话或可信流程状态；
- 可选的外部风险提供方结果。

客户端行为事件只能作为观测和辅助信号，不能单独触发认证放行。所有评分输入必须限制长度、枚举和采集范围，并按隐私要求脱敏或哈希。

### 5.2 决策和阈值

```ts
type RiskDecision =
  | 'ALLOW'
  | 'PASSIVE_CHECK'
  | 'LOW_FRICTION_CHALLENGE'
  | 'STRONG_CHALLENGE'
  | 'STEP_UP'
  | 'BLOCK'
```

默认策略如下，实际阈值必须通过观察期数据校准：

| riskScore | decision | 处置 |
| ---: | --- | --- |
| 0-19 | `ALLOW` | 不展示验证码，仍执行密码、会话和授权检查 |
| 20-49 | `PASSIVE_CHECK` | 仅执行服务端上下文和限流检查 |
| 50-69 | `LOW_FRICTION_CHALLENGE` | 展示低摩擦验证码 |
| 70-84 | `STRONG_CHALLENGE` | 展示强交互验证码 |
| 85-94 | `STEP_UP` | 验证码通过后还需要 MFA 或业务二次确认 |
| 95-100 | `BLOCK` | 拒绝、限流或进入冷却，不继续重复出题 |

阈值按业务动作配置，不允许前端选择：

```ts
type RiskPolicy = {
  action:
    | 'LOGIN'
    | 'REGISTER'
    | 'PASSWORD_RESET'
    | 'SENSITIVE_OPERATION'
    | 'DATA_READ'
    | 'DATA_EXPORT'
  thresholds: Record<RiskDecision, number>
  allowedCaptchaTypes: CaptchaType[]
  requireStepUpAbove?: number
}
```

登录中的 `ALLOW` 只表示不需要 CAPTCHA；账号密码、MFA、账号状态、会话创建和权限检查仍必须执行。密码重置、敏感操作和高权限审批可以在低风险时也要求 MFA 或强验证。

### 5.3 原因码

```ts
type RiskReasonCode =
  | 'NORMAL_CONTEXT'
  | 'RECENT_TRUSTED_SESSION'
  | 'NEW_DEVICE'
  | 'NEW_IP'
  | 'IP_REPUTATION'
  | 'HIGH_REQUEST_RATE'
  | 'FAILED_LOGIN_BURST'
  | 'CHALLENGE_REFRESH_BURST'
  | 'USER_AGENT_ANOMALY'
  | 'DEVICE_CONTEXT_CHANGED'
  | 'AUTOMATION_SIGNAL'
  | 'TOKEN_REPLAY_SIGNAL'
  | 'CONTEXT_MISMATCH'
  | 'REDISTRIBUTED_TRAFFIC'
```

原因码只用于服务端日志、监控和策略调优。对浏览器只返回通用的安全提示，防止暴露风控规则。

### 5.4 失败和评分更新

- Challenge 失败、频繁刷新、上下文变化和 Token 重放可以提高后续风险决策。
- 事件数据不能直接把用户标记为可信，也不能直接签发 Token。
- 风险升级后只能提高验证强度或拒绝，不能通过刷新降低风险。
- `BLOCK` 状态下不再无限创建 Challenge；必须使用冷却、MFA 或人工恢复流程。
- 评分、原因码和策略版本必须写入脱敏安全事件，便于审计策略效果。

### 5.5 已认证会话的异常数据访问

登录成功不代表后续访问永远可信。对已认证请求，backend 必须在业务接口层持续评估以下维度：

```text
userId + sessionId + deviceContext + clientIp + route + resourceScope
```

建议按滑动时间窗口记录以下服务端指标：

- 单位时间请求数和返回记录数；
- 并发请求数和分页游标推进速度；
- 不同资源、租户、部门或用户 ID 的访问跨度；
- `DATA_READ` 与 `DATA_EXPORT` 的调用次数；
- 失败请求、越权尝试、无效分页参数和重复游标；
- 同一 Session 短时间内的 IP、设备、User-Agent 或地域变化；
- 请求时间间隔是否过于稳定，是否明显偏离正常用户基线。

这些指标必须由服务端从真实请求和响应统计生成，不能相信客户端提交的计数或“人工操作”标记。

推荐处置顺序：

```text
正常访问
  -> 轻度异常：降低限速、缩小分页、增加冷却
  -> 中度异常：要求行为验证码后继续读取
  -> 高度异常：验证码 + MFA 或重新认证
  -> 极高风险：暂停 Session、撤销 Token、阻断数据接口并告警
```

行为验证码的触发点应是“下一次受保护数据请求之前”，而不是等爬虫已经读取大量数据后才弹窗。backend 可以返回统一的 `CAPTCHA_REQUIRED`，SDK 以 `POPUP` 模式打开验证码；验证成功后签发一个绑定以下字段的短期 Token：

```text
userId / sessionId / attemptId / action=DATA_READ
resourceScope / riskVersion / clientContext / expiresAt
```

该 Token 只允许在短时间内继续同一数据范围的请求，不能用于登录、导出、修改或其他接口。`DATA_EXPORT`、批量下载和高敏感数据即使验证码通过，也可以继续要求 MFA、审批或人工授权。

验证码不能替代接口限流和数据访问控制。对爬取行为必须同时实施分页上限、并发上限、导出配额、字段脱敏、租户/权限校验、Session 风险升级和审计告警；否则攻击者可以在验证码弹出前完成大规模数据读取，或在验证后继续自动化访问。

## 7. 多验证码类型和服务端轮换

### 7.1 类型概览

```ts
type CaptchaType =
  | 'SIMPLE_SLIDER'
  | 'SLIDER'
  | 'ROTATE'
  | 'GRID_IMAGE_SELECT'
  | 'CLICK_ORDER'
  | 'TEXT_SELECT'
```

当前实现可以先保留 `SLIDER`，但配置和接口必须按可扩展类型设计。`SIMPLE_SLIDER` 是 EMBED 模式使用的简单行为题，例如“请按住滑块，拖动到最左边”；`SLIDER` 是带拼图缺口的交互题，两者不能共用答案参数或校验器。`GRID_IMAGE_SELECT` 表示截图所示的九宫格多选图像题；它与要求点击顺序的 `CLICK_ORDER` 是两个不同题型，不能共用答案语义或校验器。`TEXT_SELECT` 或其他键盘可操作类型是无障碍和失败降级路径，不得只提供依赖视觉识别的题型。

### 7.2 引擎注册表概览

每种题型实现统一服务端接口：

```ts
interface CaptchaEngine {
  readonly type: CaptchaType
  readonly version: string

  createChallenge(input: CreateChallengeInput): Promise<ChallengePayload>
  verifyChallenge(challenge: StoredChallenge, input: VerifyChallengeInput): Promise<VerifyResult>
  validateClientPayload(payload: unknown): boolean
}
```

`CaptchaEngineRegistry` 根据服务端选出的 `CaptchaType` 查找引擎。新增题型不能通过前端传入任意类型绕过场景白名单。

### 7.3 轮换规则

- 类型由 captcha-service 根据风险决策、场景白名单和服务端权重选择。
- 首次选择可以使用加权随机；连续两次默认不得使用相同类型。
- 无障碍、设备能力和资源失败只能影响可用类型集合，不能由浏览器提升权限或降低风险。
- 刷新会重新创建 Challenge，旧 Challenge 必须原子标记为 `REPLACED`。
- 同一 Attempt 的刷新次数必须限流并参与风险评估。
- 资源版本和题型版本必须随 Challenge 返回并记录，便于灰度和回滚。

### 7.4 类型实现

各题型的 Payload、答案结构、服务端 Engine、SDK Renderer、刷新和测试规范见 [`CAPTCHA_TYPES.md`](CAPTCHA_TYPES.md)。本架构文档只规定：题型必须由服务端选择、受场景白名单约束、独立校验、版本化并使用统一的一次性 Token。

## 8. Challenge 状态和刷新

```ts
type ChallengeStatus =
  | 'ACTIVE'
  | 'VERIFIED'
  | 'FAILED'
  | 'REPLACED'
  | 'EXPIRED'
```

合法状态变化：

```text
ACTIVE -> VERIFIED
ACTIVE -> FAILED
ACTIVE -> REPLACED
ACTIVE -> EXPIRED
```

刷新流程：

1. SDK 请求 backend 创建新 Challenge，并带上当前 `AttemptId` 和旧 `ChallengeId`。
2. backend 校验 Attempt 状态和刷新限流后调用 captcha-service。
3. captcha-service 在 Redis 中以原子操作确认旧 Challenge 属于该 Attempt 且仍为 `ACTIVE`。
4. captcha-service 将旧 Challenge 标记为 `REPLACED`，创建新 Challenge，并保证同一 Attempt 最多一个 `ACTIVE` Challenge。
5. SDK 销毁旧 Renderer，渲染新类型和新资源。

不能只在浏览器中重绘或替换图片。刷新接口必须防止并发请求产生多个可用 Challenge；需要使用 Redis Lua、事务或等价的 compare-and-set 机制。

## 9. Web SDK 架构

SDK 是独立的 Web 客户端，不依赖 Vue 或 Element UI。业务页面不再自己维护验证码 `el-dialog`、Renderer 实例、Challenge 状态或刷新逻辑。

### 9.1 两种展示模式

SDK 只提供两种展示模式，业务页面不得自行拼装第三种验证码容器：

#### EMBED 内嵌模式

业务页面提供一个容器，SDK 直接渲染简单行为验证码。默认题型为 `SIMPLE_SLIDER`，交互文案为“请按住滑块，拖动到最左边”。该模式适合登录按钮附近、表单内和空间固定的页面。

```js
const captcha = createCaptcha({
  mode: 'EMBED',
  container: document.querySelector('#captcha'),
  loadChallenge: (previous) => api.createChallenge({
    username, // 业务提供的当前账号
    sceneId: 'login',
    action: 'LOGIN',
    mode: 'EMBED',
    attemptId: previous?.attemptId,
    previousChallengeId: previous?.challengeId,
  }),
  verify: (answer, challenge) => api.verify({
    answer,
    attemptId: challenge.attemptId,
    challengeId: challenge.challengeId,
    captchaType: challenge.captchaType,
    action: 'LOGIN',
  }),
  onSuccess: (result) => handleVerified(result), // 业务收到验证结果后继续流程
})

await captcha.open()
```

`EMBED` 模式的约束：

- 当前仅渲染 `SIMPLE_SLIDER`，SDK 与服务端均须拒绝不匹配的题型；
- 不自动创建遮罩和弹窗；
- 可以提供内嵌刷新按钮，但不能自行替换 Challenge；
- 成功后通过 SDK 事件或 Promise 返回结果；
- 失败、高风险或需要更强验证时，backend 返回 `UPGRADE_REQUIRED`；SDK 不得在 `EMBED` 中偷偷降级或继续放行，当前实例模式固定；业务须关闭 EMBED 实例并使用 POPUP 实例加载服务端批准的新 Challenge。

#### POPUP 弹窗模式

业务页面只渲染“点我开始验证”触发器。用户点击后，SDK 向 backend 请求风险决策和 Challenge，并在 `document.body` 下创建统一弹窗。弹窗内的题型由服务端从当前策略允许集合中随机选择。

```js
const captcha = createCaptcha({
  mode: 'POPUP',
  loadChallenge: (previous) => api.createChallenge({
    username, // 业务提供的当前账号
    sceneId: 'login',
    action: 'LOGIN',
    mode: 'POPUP',
    attemptId: previous?.attemptId,
    previousChallengeId: previous?.challengeId,
  }),
  verify: (answer, challenge) => api.verify({
    answer,
    attemptId: challenge.attemptId,
    challengeId: challenge.challengeId,
    captchaType: challenge.captchaType,
    action: 'LOGIN',
  }),
  onSuccess: (result) => handleVerified(result), // 业务收到验证结果后继续流程
})

await captcha.open() // 返回已加载的 Challenge，验证结果通过 onSuccess 交付
```

`POPUP` 模式必须由 SDK 统一提供：

- “点我开始验证”触发器状态；
- 加载、校验和失败状态；
- 刷新当前验证码；
- 关闭弹窗；
- 重新打开和重新获取 Challenge；
- 题型随机轮换；
- 键盘、焦点和无障碍替代入口；
- 成功、失败、过期、限流和服务异常提示。

业务适配层只在 loadChallenge / verify 回调中透传 Attempt 和 Challenge 标识，不维护 Renderer 或弹窗 DOM；不能在 SDK 返回失败时自行把弹窗标记为成功。POPUP 当前题型白名单不包含 SIMPLE_SLIDER；加载失败或刷新限频时应保留 SDK 的固定重试图，具体回调时机和错误阶段见 [SDK_UI_SPEC.md](SDK_UI_SPEC.md)。

#### 风控直接拉起弹窗

SDK 必须提供直接打开行为验证码弹窗的方法，供已登录数据接口、导出接口和其他 backend 风控流程调用，不要求页面先展示或点击“点我开始验证”触发器：

```js
const result = await captcha.open({
  source: 'BUSINESS_RISK',
  action: 'DATA_READ',
  riskContext: response.data.riskContext,
})
```

推荐链路：

```text
业务请求
  -> backend 发现异常访问
  -> backend 保存 Attempt 和风险决策
  -> backend 返回 CAPTCHA_REQUIRED + opaque riskContext
  -> 业务页面调用 sdk.open()
  -> SDK 请求 backend 获取 Challenge
  -> SDK 弹出随机验证码
  -> backend/captcha-service 服务端校验
  -> SDK 返回 VERIFIED 或 CLOSED
  -> 业务页面重试原业务请求
```

安全边界：

- `source`、`action` 和 `riskContext` 只是流程索引，不能让浏览器自行创建放行权；backend 必须校验它们与服务端 Attempt、Session、资源范围和当前风控决策一致。
- 浏览器不能通过把 `source` 改成 `BUSINESS_RISK`、把 `action` 改成低风险动作或删除 `riskContext` 来跳过验证。
- SDK 的 `open()` 只能请求 Challenge，不能直接返回成功 Token；Token 只能由 captcha-service 校验成功后签发。
- 验证成功后，backend 必须重新检查原业务请求的 Session、权限、资源范围和风险状态，不能只凭前端 Promise 成功就返回数据。
- `DATA_READ` 验证 Token 不得用于 `DATA_EXPORT`、写操作、登录或其他业务动作。
- backend 可以返回 `CAPTCHA_REQUIRED`，但不应把风险分数、内部原因码或答案信息返回浏览器。

当前 SDK 以实例方法 `captcha.open()` 直接拉起弹窗；后续增加静态入口时，必须复用同一套 Popup、Challenge、刷新、校验和销毁流程，不能形成第二套安全逻辑。

展示模式与题型是两个不同维度：

```ts
type CaptchaMode = 'EMBED' | 'POPUP'
type CaptchaType =
  | 'SIMPLE_SLIDER'       // EMBED 默认题型
  | 'SLIDER'              // 拼图滑块
  | 'ROTATE'
  | 'GRID_IMAGE_SELECT'
  | 'CLICK_ORDER'
  | 'TEXT_SELECT'
```

建议结构：

```text
frontend/src/captcha-sdk/
├── index.js
├── captcha-client.js
├── popup-manager.js
├── challenge-manager.js
├── renderer-registry.js
├── interaction-tracker.js
├── event-reporter.js
├── errors.js
├── styles.js
├── renderers/
│   ├── slider-renderer.js
│   ├── rotate-renderer.js
│   ├── grid-image-select-renderer.js
│   ├── click-order-renderer.js
│   └── text-select-renderer.js
└── accessibility/
    ├── focus-manager.js
    └── keyboard-support.js
```

SDK 对外只暴露稳定的生命周期：

```ts
interface CaptchaInstance {
  open(options?: OpenOptions): Promise<CaptchaResult>
  refresh(): Promise<void>
  close(reason?: string): void
  destroy(): void
  getState(): CaptchaState
  on(event: CaptchaEventName, handler: Function): () => void
}
```

建议状态：

```ts
type CaptchaState =
  | 'IDLE'
  | 'OPENING'
  | 'LOADING'
  | 'READY'
  | 'VERIFYING'
  | 'REFRESHING'
  | 'SUCCESS'
  | 'FAILED'
  | 'EXPIRED'
  | 'CLOSED'
  | 'RATE_LIMITED'
```

SDK 的 `open()` 结果：

```ts
type CaptchaResult =
  | { status: 'SKIPPED'; attemptId: string }
  | { status: 'VERIFIED'; attemptId: string; captchaToken: string }
  | { status: 'CLOSED'; attemptId: string }
```

`SKIPPED` 只表示 backend 返回了 `ALLOW` 或不需要交互的决策；业务页面必须继续调用 backend 登录接口，由 backend 根据自己的 Attempt 状态最终决定是否允许登录。SDK 不计算风险，不信任浏览器传入的决策，不生成认证凭证。

### 9.2 SDK Popup

默认由 SDK 在 `document.body` 下创建 Popup，不要求业务页面提供容器。Popup 必须具备：

- `role="dialog"`、`aria-modal="true"` 和可访问标题；
- 打开后焦点进入验证码区域，关闭后焦点返回触发元素；
- 刷新、关闭、替代验证按钮有明确的 `aria-label`；
- 加载、失败、成功状态通过 `aria-live` 通知；
- 支持键盘操作和至少一种不依赖视觉识别的替代路径；
- 移动端响应式布局和安全区域适配；
- 使用 Shadow DOM 或严格的 CSS 命名空间，不能污染业务页面。

### 9.3 Renderer

Renderer 的统一接口、生命周期、输入事件、无障碍、资源错误和题型专属实现见 [`CAPTCHA_TYPES.md`](CAPTCHA_TYPES.md)。SDK 核心只负责 Challenge 请求、校验、状态机、刷新、超时、错误和销毁；Renderer 不得签发 Token、改变风险决策或调用内部 captcha-service。

## 10. 对外 backend API

浏览器只访问 backend，使用 camelCase DTO；captcha-service 内部协议使用 PascalCase，禁止直接透传内部字段。

### 10.1 创建或评估

```http
POST /api/v1/captcha/challenges
```

浏览器只提交业务允许的字段，例如：

```json
{
  "scene": "login",
  "action": "LOGIN"
}
```

主体、IP、User-Agent、设备上下文和 AttemptId 由 backend 服务端管理或采集，不能由浏览器覆盖。

低风险响应：

```json
{
  "code": "000000",
  "message": "success",
  "data": {
    "requiresCaptcha": false,
    "attemptId": "uuid"
  }
}
```

需要挑战时：

```json
{
  "code": "000000",
  "message": "success",
  "data": {
    "requiresCaptcha": true,
    "attemptId": "uuid",
    "challengeId": "uuid",
    "captchaType": "ROTATE",
    "typeVersion": "ROTATE@1.0",
    "resourceVersion": "rotate-default@1",
    "expiresIn": 120,
    "payload": {}
  }
}
```

不返回 `riskScore`、`confidence`、内部 `RequestId`、Prefix、ServiceId、答案或 Redis 信息。

### 10.2 校验

```http
POST /api/v1/captcha/verify
```

backend 从服务端 Attempt 状态补充主体和上下文，不信任浏览器重复提交的用户名、场景或客户端身份。成功后仅返回短期 `captchaToken` 和 `attemptId`。

### 10.3 观测事件

```http
POST /api/v1/captcha/events
```

事件只用于监控和问题排查，成功返回 `204 No Content`，不能影响 Challenge 校验、Token 签发、Token 消费、登录或授权。

## 11. 内部协议

只有 backend 可以调用：

```text
POST /internal/v1/assessments
POST /internal/v1/challenges
POST /internal/v1/verify
POST /internal/v1/tokens/consume
POST /internal/v1/events
```

共同字段：

```json
{
  "ApiVersion": "1",
  "ProtocolVersion": "1.0",
  "RequestId": "uuid",
  "ServiceId": "backend-admin",
  "Operation": "CreateChallenge",
  "Timestamp": 1790057399,
  "SignatureMethod": "HMAC-SHA256",
  "SignatureVersion": "1.0",
  "SignatureNonce": "uuid",
  "SceneId": "login",
  "AttemptId": "uuid",
  "Signature": "base64"
}
```

backend 每次真实调用必须生成新的 `RequestId`、`SignatureNonce` 和时间戳，并校验响应中的版本、RequestId、业务码和结构。重试不能复用 nonce；需要幂等时必须使用显式、受作用域限制的幂等键。

字段命名必须保持以下边界：`Operation` 仅表示内部协议操作名（`CreateChallenge`、`VerifyChallenge`、`ConsumeToken`），`Action` 仅表示业务动作（`LOGIN`、`DATA_READ`、`DATA_EXPORT`）。协议路由、签名和操作审计使用 `Operation`；风险策略、Challenge/Token 作用域和业务审计使用 `Action`，禁止把二者混用。

正式协议的必填边界：创建 Challenge 必须带 `Operation`、`SceneId`、`AttemptId`、`Action`、`Mode`、`Subject`、`ClientIp` 和 `UserAgent`；验证必须带 `Operation`、`SceneId`、`AttemptId`、`ChallengeId`、`Action`、`CaptchaType`、`Subject`、`ClientIp`、`UserAgent` 和题型完整 `Answer`；消费 Token 必须带 `Operation`、`SceneId`、`AttemptId`、`CaptchaToken`、`Action`、`CaptchaType`、`Subject` 和 `ClientIp`。只有设备标识、题型选择提示和无障碍交互元数据允许按场景作为可选字段存在，且不得影响安全主链路。

内部接口成功统一返回 HTTP 200；错误由统一协议包装。内部 RequestId 只留在服务端日志和调用链中，不返回浏览器。

### 11.1 Assessment

`CreateAssessment` 成功返回风险决策，backend 将结果写入自己的 Attempt 状态：

```json
{
  "AssessmentId": "uuid",
  "Decision": "LOW_FRICTION_CHALLENGE",
  "ExpiresIn": 60,
  "PolicyVersion": "login-risk@1"
}
```

如果决策为 `ALLOW`，不创建 Challenge；如果需要交互，才创建 Challenge。backend 登录时必须检查 Attempt 状态和 Assessment 有效期，不能通过客户端删除或伪造 CAPTCHA 字段绕过决策。

### 11.2 CreateChallenge

必须携带服务端可信的 `AttemptId`、动作、主体上下文和服务端选定的允许类型集合。captcha-service 重新校验场景策略和限流，不能接受浏览器指定的任意题型。

### 11.3 VerifyChallenge

必须携带 `AttemptId`、`ChallengeId`、题型对应的答案载荷和必要交互数据。captcha-service 校验绑定关系、资源版本、过期时间、限流、题型规则和交互规则；成功后原子消费 Challenge 并创建 CaptchaToken。

### 11.4 ConsumeToken

backend 在登录或受保护业务执行前调用。captcha-service 原子删除或标记 Token 为已消费，并核对 Attempt、动作、主体、场景和客户端上下文。返回 `Valid=false` 时，业务必须拒绝。

## 12. 状态存储和 Redis 原子性

Redis Key 必须包含环境、项目 Prefix 和对象类型：

```text
captcha:{Environment}:{Prefix}:attempt:{AttemptId}
captcha:{Environment}:{Prefix}:assessment:{AssessmentId}
captcha:{Environment}:{Prefix}:challenge:{ChallengeId}
captcha:{Environment}:{Prefix}:attempt-active-challenge:{AttemptId}
captcha:{Environment}:{Prefix}:token:{TokenHash}
captcha:{Environment}:{Prefix}:nonce:{Nonce}
captcha:{Environment}:{Prefix}:rate:{Dimension}:{ValueHash}
```

- 所有对象必须设置短 TTL；默认 Challenge 和 Token 不超过 120 秒，Assessment 默认不超过 60 秒。
- Token 只保存哈希或等价不可逆值。
- Challenge 消费、Token 消费、nonce 写入和刷新替换必须使用 Lua、事务或等价 compare-and-set 操作。
- Redis 不可用时，所有创建、校验、消费和风险决策相关操作安全失败，绝不自动放行。
- Prefix 只存在于服务端配置、Redis 命名空间和脱敏日志，不能出现在浏览器配置或对外响应。

## 13. 限流、重放和故障处理

Create、Assessment、Verify、Consume、Event 和业务 Login 使用独立限流；至少按 IP、主体、AttemptId、ServiceId 和接口维度组合控制，不能只依赖 IP。

必须限制：

- Challenge 创建频率；
- 同一 Challenge 的失败校验次数；
- Attempt 刷新次数；
- Token 消费次数；
- 事件上报频率；
- 登录失败和高风险请求频率。

错误策略：

| 情况 | 对外状态 | 是否放行 |
| --- | ---: | --- |
| 参数、上下文、Challenge 或 Token 无效 | 400 | 否 |
| 未认证或会话失效 | 401 | 否 |
| 已认证但无权或需要步骤升级 | 403 | 否 |
| 触发限流或冷却 | 429 | 否 |
| captcha-service、Redis 或必要依赖不可用 | 503 | 否 |
| 未预期内部错误 | 500/503 | 否 |

不得通过 HTTP 200 伪装错误，不得因评分服务、Redis、验证码引擎或外部风险提供方不可用而自动放行。

## 14. 输入、隐私和日志

- backend 和 captcha-service 使用 DTO 白名单，拒绝未知 body 字段。
- 所有字符串、数组、数字、轨迹点、事件类型和题型载荷都必须限制长度、数量、范围和字符集。
- `SceneId`、Prefix、ServiceId、ClientIp、User-Agent、风险决策和权限字段不能由浏览器覆盖。
- 仅在可信代理链下解析 `X-Forwarded-*`；否则忽略客户端伪造的转发头。
- 服务端生成 `traceId`，不信任客户端同名请求头；traceId 不能用于鉴权、限流、幂等或 Redis Key。
- 日志禁止写入密码、Secret、签名、CaptchaToken、答案、完整轨迹、完整 IP、完整 User-Agent 和 Redis Key。
- 风险分数、原因码、策略版本、题型、结果和耗时可以脱敏后用于监控，但事件不能反向改变认证状态。

## 15. 会话和业务安全

- CAPTCHA 不能替代密码、MFA、会话校验或权限检查。
- 登录成功后只通过 `HttpOnly; Secure; SameSite=Lax` Cookie 建立会话。
- 登录响应不得返回 Session Token、权限、登录 IP、失败次数或内部 RequestId。
- 前端加载异步路由前必须调用服务端 `/api/v1/auth/me`，localStorage 只能作为 UI 状态。
- 密码重置、密码修改和高权限操作必须重新执行相应的身份验证和步骤升级。
- 不存在账号、密码错误、验证码失败和账号锁定使用不可枚举的对外语义。

## 16. 多项目和多实例

每个 backend 使用独立的 `ServiceId`、`ServiceSecret`、Prefix、场景配置和限流配置。captcha-service 依据 ServiceId 加载绑定，不接受浏览器传入项目身份。

多实例部署必须无状态：

```text
backend -> load balancer -> captcha-service instances -> shared Redis
```

- 实例不在本地保存安全状态，不依赖 sticky session。
- 共享 Redis 时必须按 Prefix 隔离所有对象和限流维度。
- 实例共享兼容的协议、资源版本、绑定配置和密钥版本。
- 密钥轮换支持短期旧密钥验证、新密钥签发，并有明确失效时间。
- 健康检查必须包含 Redis readiness；未就绪实例不得接收业务流量。

## 17. 配置基线

配置必须支持：

- 多种 `CaptchaType` 和场景白名单；
- 默认题型仅作为无评分兼容回退，不能绕过风险决策；
- 类型权重、连续重复限制和无障碍替代类型；
- Assessment、Challenge、Token TTL；
- Assessment、Create、Verify、Consume、Event 和刷新限流；
- 单 Challenge 失败次数和冷却时间；
- 风险策略版本和灰度开关；
- 资源版本和题型版本；
- 生产环境强制 Redis、强 Secret、HTTPS/mTLS、可信代理和非默认 Swagger 密码。

配置示例：

```json
{
  "login": {
    "allowedCaptchaTypes": ["SIMPLE_SLIDER", "SLIDER", "ROTATE", "GRID_IMAGE_SELECT", "CLICK_ORDER", "TEXT_SELECT"],
    "defaultCaptchaType": "SLIDER",
    "allowedModes": ["POPUP", "EMBED"],
    "defaultMode": "POPUP",
    "rotation": {
      "strategy": "WEIGHTED_RANDOM",
      "avoidConsecutiveRepeat": true,
      "weights": { "SIMPLE_SLIDER": 20, "SLIDER": 20, "ROTATE": 15, "GRID_IMAGE_SELECT": 20, "CLICK_ORDER": 15, "TEXT_SELECT": 10 }
    },
    "status": "ACTIVE"
  }
}
```

`defaultCaptchaType` 不代表所有用户都必须使用该类型；当评分策略启用时，最终类型由服务端决策和场景白名单共同确定。

## 18. 观测、校准和外部提供方

必须监控：

- 各风险区间的请求量、实际攻击率和误伤率；
- 各决策的成功率、失败率和平均耗时；
- 各验证码类型成功率、刷新率、过期率和资源失败率；
- Token 重放、Challenge 重放、上下文不一致和限流命中；
- Redis 可用性、延迟和服务错误；
- 无障碍替代流程使用率和完成率。

评分策略先以观察模式运行，再逐步启用 `ALLOW`、低摩擦挑战、强挑战和 `BLOCK`。每次调整必须记录策略版本并可回滚。

外部风险提供方只能通过服务端 Provider 接口接入：

```ts
interface RiskProvider {
  assess(input: RiskInput): Promise<RiskAssessmentInput>
}
```

外部 Token 必须由服务端验证其站点、动作、有效期、一次性和来源；外部服务不可用时按本服务的安全失败策略处理，不能直接放行。

## 19. 测试与验收

### 19.1 单元测试

必须覆盖：

- 签名、时间窗口和 nonce 防重放；
- Assessment 与 Attempt 绑定和过期；
- `ALLOW` 不创建 Challenge，但最终业务仍要求服务端 Attempt 状态；
- Challenge 类型白名单和版本校验；
- Challenge 刷新原子替换和连续类型限制；
- Challenge 一次性、Token 一次性和并发消费；
- Attempt、主体、动作、场景和客户端上下文绑定；
- 限流、冷却和风险升级；
- DTO 白名单、轨迹边界和错误映射；
- Redis 故障时安全失败。

### 19.2 集成测试

必须验证：

- 浏览器无法直接访问 captcha-service；
- 无效 ServiceId、Secret、证书、签名和 nonce 不能调用内部接口；
- 低风险流程无法通过篡改前端 `SKIPPED` 绕过 backend 登录状态；
- 刷新后旧 Challenge 永远不能成功；
- 并发 Verify 和 Consume 至多一次成功；
- 跨项目、跨账号、跨 Attempt、跨场景和跨 IP 使用全部失败；
- Redis 或评分服务不可用时不会自动放行；
- SDK 关闭、重复打开、快速刷新、资源失败和弹窗销毁不会遗留监听器或错误实例；
- 键盘和替代验证流程可以完成至少一种受支持的验证码。

### 19.3 验收标准

- 浏览器没有 ServiceSecret、Prefix、答案、Redis Key 或内部 RequestId。
- 低风险免交互只由 backend 的服务端 Attempt 状态生效。
- 所有 Challenge 和 Token 都有短 TTL、原子消费和上下文绑定。
- 同一 Attempt 最多一个 ACTIVE Challenge。
- 验证码类型由服务端选择，前端不能任意指定或降低验证强度。
- captcha-service、Redis 或必要风险依赖故障时默认拒绝。
- SDK 统一负责 Popup、Renderer、刷新、生命周期、无障碍和事件；业务页面不再自行维护验证码弹窗。
- 登录成功只建立 HttpOnly 会话，前端必须通过 `/auth/me` 获取登录信息。
