# Web SDK 界面与交互规范

本规范记录当前已确认的界面规则，适用于 SDK 开发、backend 适配和验收。题型及答案协议见 [CAPTCHA_TYPES.md](CAPTCHA_TYPES.md)，认证、安全和风险决策见 [REQUIREMENTS.md](REQUIREMENTS.md)。规划中的替代题型不属于当前已实现功能。

## 1. 题型与模式

| 模式 | 当前允许题型 | 展示方式 |
| --- | --- | --- |
| `EMBED` | `SIMPLE_SLIDER` | 业务提供容器，不创建弹窗 |
| `POPUP` | `SLIDER`、`ROTATE`、`GRID_IMAGE_SELECT`、`CLICK_ORDER` | SDK 创建统一弹窗 |

服务端先取场景白名单与模式允许题型的交集，再应用权重；默认及零权重回退也只能来自该交集。首次加载、刷新和 `setChallenge()` 均须校验模式与题型，POPUP 不得出现 SIMPLE_SLIDER。实例模式固定，`open()` 不负责跨模式升级。

## 2. 固定尺寸

以下单位均为 CSS px，弹窗采用 `box-sizing: border-box`。四种 POPUP 题型、加载中和加载失败共用 **318 × 318** 外框。

| 区域 | 尺寸或间距 | 说明 |
| --- | --- | --- |
| 弹窗 | 318 × 318 | 固定宽高，不随题型、提示或状态变化 |
| 弹窗内边距 | 四边 8 | 内部可用宽度 302 |
| 标题 | 高 44 | 文字和目标图标垂直居中 |
| 画布 | 300 × 180 | 水平居中，内层左右各补 1px |
| 操作区上边距 | 8 | 画布与控件之间的间距 |
| 操作区 | 300 × 30 | 九宫格留空；加载失败不渲染操作区 |
| 底栏上边距 | 10 | 与题面主体之间的间距 |
| 底栏 | 高 30 | 品牌在左，操作按钮在右 |

高度核算：`8 + 44 + 180 + 8 + 30 + 10 + 30 + 8 = 318`。题面主体占高为 `180 + 8 + 30 = 218`；失败界面虽不渲染操作区，仍保留主体占高，底栏位置不变。EMBED 不使用弹窗固定高度。

## 3. 画布与坐标

- 四种 POPUP Payload 必须携带 `canvasWidth: 300`、`canvasHeight: 180`；SDK 拒绝缺失或不匹配的尺寸。
- 服务端尺寸集中于 `src/captcha/config/canvas.ts`，SDK 尺寸集中于 `sdk/constants.js`；修改时须同步，不能仅改变 CSS。
- 旧环境变量 `CAPTCHA_CANVAS_WIDTH`、`CAPTCHA_CANVAS_HEIGHT` 不再覆盖统一画布。
- 背景完整铺满画布，不使用 `object-fit: cover` 裁切整个题图；九宫格单张候选图片仍可使用 cover 填充格子。
- 拼图位置使用原生画布像素；屏幕滑轨有效行程为 `track.clientWidth - button.offsetWidth`，按比例映射到 `min(trackWidth - buttonWidth, canvasWidth - pieceSize)`，不能把屏幕位移直接当作答案。
- 拼图 SVG 含每边 2px 描边留白。显示外框大小为 `pieceSize + 4`，左上角定位为 `(x - 2, targetY - 2)`，再按画布宽高换算百分比。
- 顺序点击区域的 `x/y` 是左上角百分比，`width/height` 是尺寸百分比。像素换算为 `x / 100 × 300`、`y / 100 × 180`；背景符号与点击框必须使用同一中心。
- 顺序点击当前使用 48 × 48px 点击区域，换算为宽 `48 / 300 × 100%`、高 `48 / 180 × 100%`。悬浮框和选中框以对应图标为中心。

## 4. 标题与底栏

### 4.1 标题目标图标

`.tac__header-targets` 内所有 `.tac__header-target` 统一为 **28 × 28**，禁止 Flex 压缩，使用 `object-fit: contain`。图标 img 不设置内联样式，尺寸由 CSS 统一维护。

顺序题还须统一 SVG 可见图形的最长边及中心，消除图源留白差异；不能仅把不同 SVG 的外框设置成同样大小。

### 4.2 底栏

DOM 顺序固定为品牌、操作区；操作区中刷新在前、关闭在后：

```html
<div class="tac__footer">
  <span class="tac__vendor">CAPTCHA</span>
  <div class="tac__footer-actions">
    <button class="tac__footer-button" type="button" aria-label="刷新验证码">
      <!-- 顺时针刷新 SVG -->
    </button>
    <button class="tac__footer-button" type="button" aria-label="关闭验证">
      <!-- 关闭 SVG -->
    </button>
  </div>
</div>
```

品牌左对齐、按钮右对齐。按钮为 26 × 26，SVG 为 20 × 20，水平和垂直居中；使用 SVG，不用字体字符代替，避免字体基线造成偏移。首次加载和失败界面也采用相同底栏。

## 5. 各题型交互

| 题型 | 交互与提交 | 外观约束 |
| --- | --- | --- |
| `SIMPLE_SLIDER` | 从右端向左拖动，松开后提交轨迹；失败回到右端 | 仅嵌入，默认指示向左，不展示拼图 |
| `SLIDER` | 从左向右拖动，使拼图对准缺口；松开后提交；失败复位 | 42 × 28 蓝色圆角手柄，白色单向右箭头 SVG；浅灰轨道；悬浮、按下及键盘焦点反馈；拖动中隐藏“向右拖动完成拼图”指引；背景图源不带圆角 |
| `ROTATE` | input 实时旋转，change（松开或角度调整结束）自动提交 | 操作区仅保留旋转滑杆，不显示确定按钮 |
| `GRID_IMAGE_SELECT` | 支持选择、取消，达到服务端要求数量后自动提交 | 保留选中标记，不显示“已选择几张”或计数条；操作区留空并保留占高 |
| `CLICK_ORDER` | 按提示顺序选择，点击确定提交；支持撤销并重排编号，不允许超量选择 | 显示当前选择顺序，不泄露正确答案；保留确定按钮 |

旋转题画布使用静止的浅灰蓝渐变（基色 `#F3F6FA`）与低对比度圆形底盘。中央旋转图片为 170 × 170，底盘为 176 × 176；仅图片旋转。背景装饰用 CSS 实现，不新增网络图片请求，不参与角度计算。服务端随机偏转必须烘焙到图像像素，不能向浏览器暴露目标恢复角度。

滑块使用 Pointer Events 与指针捕获，支持方向键操作后回车提交；拖动事件、指针捕获和计时器必须随题型替换及销毁清理。

## 6. 统一提示

所有文字提示使用 `.tac__message`，移除 `.tac__status`。每次只显示一处提示。

| 状态 | 内容 | 样式 |
| --- | --- | --- |
| 加载中 | `正在加载验证码…` | 与 loading 图标组合居中 |
| 提交中 | `正在验证…` | 原有 message 更新，不增加布局高度 |
| 验答成功 | `验证成功，耗时 X.XX 秒` | `.success`：绿色背景 `#16A34A`，白字 `#FFF` |
| 验答失败，包括本地答案校验失败 | `验证失败，请重新尝试！` | `.error`：红色背景 `#DC2626`，白字 `#FFF` |
| 题目过期 | `验证码已过期，请刷新` | `.error`；停止继续作答，允许刷新 |

`.tac__message` 文字居中，提示条高 20、行高 20；不得设置圆角相关样式，包括 `border-radius: 0`。正常题面的提示覆盖画布底部，不额外占用高度；加载文字按专用加载视图布局。

提交中、成功停留和过期时必须阻止重复操作，同时保持画布和提示原色。不得通过整体降低 `.tac__body` 的 opacity 使画布变灰；当前采用 fieldset 禁用与 `pointer-events: none`。验答失败后恢复可操作状态。

## 7. 耗时与成功停留

- 使用 `performance.now()` 单调时钟，从**本次首次操作到提交答案**统计，显示两位小数。
- 不计入题目加载、操作前停留、验答接口等待和成功提示停留时间。
- 失败重试、刷新、换题后重新计时；提交时冻结耗时，接口返回时不重新计算。
- POPUP 成功后保留提示 **2 秒**，再调用业务 `onSuccess(result)`，随后关闭原弹窗，避免登录页提前跳转。
- 关闭、刷新、替换或销毁必须取消旧题延迟回调；回调期间打开的新弹窗也不能被旧定时器关闭。
- EMBED 成功后立即触发 `onSuccess`，不自动关闭业务容器。

## 8. 独立加载与失败视图

### 8.1 加载中

首次加载、切换、刷新使用独立的 `renderers/loading.js`，不把旧题面留在遮罩下。画布中的 spinner 与加载文字作为一组垂直居中，二者间距固定 **10px**；不能把 spinner 放在中央、文字放在画布底部。

切换/刷新动画至少显示 **500ms**。请求较快也须等待到 500ms；请求超过 500ms 时，继续显示到请求完成，失败同样等待后再展示。首次打开不人为增加最低等待时间。动画不能改变弹窗尺寸，须兼顾减少动态效果偏好。

### 8.2 加载失败与刷新限频

请求失败、Payload 无效、题图加载失败、加载/刷新限频均进入 `renderers/load-error.js`：

- 标题为“请稍后再试”，移除目标图标；
- 画布使用固定 [load-failed.svg](../sdk/assets/load-failed.svg)，图片内包含“请稍后再试”；
- 不渲染操作区、计数、滑杆或确定按钮，也不在失败图上叠加第二份错误文案；
- 保留固定弹窗尺寸、品牌、刷新和关闭按钮；点击刷新重新进入专用加载视图；
- 仅变更展示，后端限频、上下文校验和过期规则仍须生效。

`onFail(error, { phase: 'load' })` 表示加载类错误；业务页面应保留该失败界面，不主动关闭弹窗或另弹限频提示。`phase: 'verify'` 表示验答或作答过程错误，按认证流程处理。验答失败使用统一红色提示条，不切换为加载失败图。

## 9. 刷新与样式更新

刷新沿用 backend 生成的 Attempt，由 `loadChallenge(previous)` 将 `attemptId` 和 `previousChallengeId: previous.challengeId` 交给 backend。服务端原子替换旧 Challenge，旧题不能再校验；SDK 忽略旧加载和验证响应。

样式通过唯一 `#captcha-sdk-style` 节点注入。重复安装须更新现有节点内容，不能因为节点已存在就跳过。Vite 热更新应刷新该样式；禁止不断叠加同 ID 节点，否则容易出现“代码已修改但样式未生效”。

## 10. 文件分工与验收

每种题型有独立脚本，拖动采集可共享，不能把 SIMPLE_SLIDER 和 SLIDER 合成一个题面 Renderer：

```text
sdk/core.js                  # 生命周期、请求、提示、耗时、成功延迟
sdk/dom.js                   # 样式、底栏 SVG、事件清理
sdk/constants.js             # 模式、题型、画布常量
sdk/validation.js            # 模式、Payload、画布和答案校验
sdk/renderers/simple-slider.js
sdk/renderers/slider.js
sdk/renderers/drag.js         # 共享拖动采集工具
sdk/renderers/rotate.js
sdk/renderers/grid.js
sdk/renderers/click-order.js
sdk/renderers/loading.js
sdk/renderers/load-error.js
sdk/assets/load-failed.svg
```

验收必须覆盖：模式隔离、四种题型及加载/失败状态尺寸一致、背景与点击框对齐、图标大小、单一提示、自动提交和撤销、计时排除等待、成功停留与旧回调取消、加载动画时长及间距、失败图恢复、刷新限频保留弹窗，以及禁用时画布不变灰。

```bash
nvm use
pnpm --filter captcha-service test
pnpm --filter frontend exec vitest run --config vitest.config.js test/unit/captcha-sdk.test.js
pnpm --filter captcha-service build
pnpm --filter frontend build
```
