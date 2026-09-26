# Media Bridge Options

> 评估时间：2026-09-26。第三方项目会变化，部署前应重新核对其最新文档和发布状态。

HomeSphere 的目标不是寻找“功能最多”的 Bridge，而是寻找：

1. 115 接入风险面尽量小；
2. 优先官方开放平台；
3. 能生成标准 STRM；
4. 播放时能 302 到最终 CDN，而不是代理电影字节；
5. 只需要一个账号服务；
6. HomeSphere 不保存115凭据；
7. 部署和升级足够简单。

## 当前结论

### CloudDrive2

优点：

- 官方当前明确支持 `115open`；
- 官方文档明确建议旧115私有接口迁移到115open；
- Core 持续维护；
- 提供完整 gRPC API；
- API Token 可按权限授权，包括只读范围；
- 官方明确限制115并发/请求节奏，方向符合 HomeSphere 的保守策略。

进一步核对官方配套媒体插件后，CloudDrive2 更适合做115open文件系统层：它的媒体直播放式偏向“把服务端路径映射回客户端自己的 CloudDrive2 App”，相关 Resolve 接口返回路径而不是浏览器可用的最终直链 URL。

因此 CloudDrive2 **不能单独完成 HomeSphere 所需的浏览器 302 Bridge 契约**。如果未来使用它，需要再加一个明确、可审计的 resolver 适配层；否则通过挂载/WebDAV读取电影字节会让服务器进入数据通路，不符合 HomeSphere 目标。

**状态：可作为115open底层，但不是独立默认 Bridge。**

### OpenStrm

优点：

- 活跃；
- 单容器；
- SQLite；
- STRM 生成和115 302链路成熟；
- 有账号级限流和失败退避；
- 维护成本较低。

当前问题：

- 当前115账户配置仍以 Cookie 为主要入口；
- 这和 HomeSphere“生产优先官方开放平台”的交付原则不完全一致。

**状态：功能适配度高，作为兼容/实验候选，不作为默认生产推荐。**

### QMediaSync

优点：

- 115开放平台；
- 有完整限流器；
- STRM 已使用 `/115/newurl?pickcode=...` 形式；
- 直链解析端点可以直接返回302；
- 从接口形态上非常适合 HomeSphere 的内网 resolver。

当前问题：

- 主仓库明确说明作者暂时停更；
- 开源版本不包含115开放平台账号；
- 自建版本需要自备 AppID，并自行处理 OAuth 服务端或改造二维码授权；
- 当前版本还引入 PostgreSQL，整体交付比 HomeSphere 希望的更重。

**状态：作为 Bridge API 形态参考，不作为默认打包依赖。**

### QMediaSync 的第三方 fork

有些 fork 提供内建 AppID/授权服务，看起来更开箱即用。

HomeSphere 默认不依赖这类内建第三方授权身份，因为这会把115账号授权链路交给额外第三方，和“最小信任面”的目标冲突。

**状态：用户自行选择时可以兼容，但不作为官方默认。**

## 当前 HomeSphere 决策

不为了追求“马上能跑”而把某个不够理想的 Bridge 焊死进仓库。

HomeSphere 已经固定最小接口：

```text
共享目录：标准 .strm
播放：STRM URL 返回 3xx
HomeSphere：内网解析 → 最终 CDN 302
```

因此 Bridge 可以单独替换。

当前优先级：

```text
1. 寻找/验证“115open + STRM + 3xx resolver”的轻量独立 Bridge
2. CloudDrive2 可作为115open文件系统底层，但需要 resolver 适配层
3. QMediaSync 的 /115/newurl 作为 resolver 接口形态参考
4. OpenStrm 作为 Cookie 模式兼容候选
```

所有候选必须按 `BRIDGE_VALIDATION.md` 完成真实115账号 + iPhone测试，才能升级为 PASS。

在没有完成真实115账号、真实大文件、iPhone Safari 的端到端测试之前，不把任何第三方 Bridge 声明为“默认已验证”。
