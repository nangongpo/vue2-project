# captcha-service 文档索引

| 文档 | 维护范围 |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | 场景、认证、安全边界、风险决策和协议基线；包含分阶段架构目标 |
| [CAPTCHA_TYPES.md](CAPTCHA_TYPES.md) | 题型、模式白名单、Payload、服务端验答和 Renderer 职责 |
| [SDK_UI_SPEC.md](SDK_UI_SPEC.md) | 当前界面与交互规范：最终尺寸、图标、提示、耗时、加载及失败/限频状态 |
| [CONFIGURATION.md](CONFIGURATION.md) | 环境变量、服务绑定和部署配置 |
| [CAPTCHA_RESOURCES.md](CAPTCHA_RESOURCES.md) | 图片类别、候选图库、审核、生产与版本管理 |
| [SECURITY_AUDIT_REMEDIATION.md](SECURITY_AUDIT_REMEDIATION.md) | 安全审计与整改记录 |

界面尺寸和样式以 SDK_UI_SPEC.md 集中维护，其他文档引用该规范。当前 EMBED 只允许 SIMPLE_SLIDER；POPUP 支持 SLIDER、ROTATE、GRID_IMAGE_SELECT、CLICK_ORDER。TEXT_SELECT、AUDIO 和尚未启用的架构能力属于规划，不应当作已实现功能接入。
