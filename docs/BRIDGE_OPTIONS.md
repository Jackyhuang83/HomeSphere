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

- 当前推荐使用 `115open`；
- Core 持续维护；
- 有公开完整 gRPC API；
- API Token 可以限制根目录、有效期与具体操作权限；
- `GetDownloadUrlPath` 明确支持 `get_direct_url=true`；
- 返回 `directUrl`、有效期、推荐 `userAgent` 与 `additionalHeaders`；
- 这使 HomeSphere 理论上可以只持有一个“限目录 + 只读”的 CD2 Token，而不接触115凭据。

浏览器场景的关键限制：

- CD2 的 directUrl 可能要求指定 User-Agent 或额外 Header；
- 普通 Safari/Chrome 经过 HTTP 302 后不能由 HomeSphere 强制追加这些 Header；
- CloudDrive2 官方的跨设备 Direct Stream 主要通过 CloudDrive 客户端协作，而不是把任意浏览器当作另一个 CloudDrive 客户端；
- 因此不能仅凭“API 返回 directUrl”就宣称 HomeSphere WebUI 已经可以安全直连。

HomeSphere 已加入最小 CD2 兼容性探针：

- 不引入第三方 gRPC 依赖；
- 只调用 `GetDownloadUrlPath`；
- 不回显 Token、完整直链或 Header 值；
- 只有在无额外 Header、UA 条件匹配、目标为公网 URL 时才允许 iPhone/Safari 做一次302实测。

**状态：第一优先验证对象；通过真实115open + iPhone测试后，才决定是否升级为默认两组件架构。**

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

### SmartStrm

优点：

- 当前仍维护；
- STRM 生成成熟；
- 支持多种网盘；
- 支持302直链玩法。

当前限制：

- CloudDrive2 gRPC 作为直接文件源仍是公开 issue 中的需求，并未成为现成驱动；
- 现有社区方案主要是 CD2 WebDAV 做目录层，再把 STRM URL 替换到另一套115解析入口；
- 这会重新形成多个115访问入口，不符合 HomeSphere“一个受控入口”的目标；
- 302能力还涉及 Pro 功能与额外配置。

**状态：不作为 HomeSphere 默认 Bridge；不采用 CD2 WebDAV + 第二套115 resolver 的叠层方案。**

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
1. 使用 HomeSphere 内置探针验证 CloudDrive2 + 115open 的浏览器直链条件
2. 若 iPhone/Safari 实测 PASS，再评估收敛为 CloudDrive2 + HomeSphere 两组件
3. 若 CD2 directUrl 需要浏览器无法携带的 Header，则保持 STRM/3xx Bridge 契约
4. QMediaSync 的 /115/newurl 继续作为 resolver 接口形态参考
5. OpenStrm 作为 Cookie 模式兼容候选
```

所有候选必须按 `BRIDGE_VALIDATION.md` 完成真实115账号 + iPhone测试，才能升级为 PASS。

在没有完成真实115账号、真实大文件、iPhone Safari 的端到端测试之前，不把任何第三方 Bridge 声明为“默认已验证”。
