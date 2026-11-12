# captcha-service 图片资源目录

资源目录只保存已审核、已版本化的行为验证码图片。AI 生成图片先进入暂存区，审核通过后由 `ResourcePublisher` 发布到：

```text
resources/captcha/versions/<resourceVersion>/
```

根目录的 `active.json` 原子指向当前生产版本。禁止直接修改已发布版本，禁止把临时素材放入生产版本目录。

完整的题型分类、开发/生产环境数量、图片大小、AI 提示词和验收流程见 [`docs/CAPTCHA_RESOURCES.md`](../../docs/CAPTCHA_RESOURCES.md)。

生产资源必须记录：

- `resourceVersion`；
- 题型和业务类别；
- SHA-256；
- AI 模型、提示词版本和生成时间；
- 来源、许可证和人工审核状态；
- 顺序或方向元数据（适用时）。

图片内容不会作为安全密钥。答案集合、点击顺序和旋转目标只保存在服务端 Challenge 中。
