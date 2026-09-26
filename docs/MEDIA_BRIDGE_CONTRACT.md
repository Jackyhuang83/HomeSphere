# Media Bridge Contract

HomeSphere 的生产默认架构把 115 账号能力与 WebUI 完全分离。

```text
115 / 115open
     │
     ▼
Media Bridge
  ├─ 持有115授权
  ├─ 低频/增量同步
  ├─ 生成STRM
  └─ 播放时返回302
     │
     │ 只写 STRM 目录
     ▼
/media  (HomeSphere 只读)
     │
     ▼
HomeSphere
  ├─ SQLite
  ├─ TMDB
  ├─ 海报墙
  └─ 登录鉴权
```

## HomeSphere 与 Bridge 的唯一媒体契约

Bridge 在共享目录生成标准 `.strm` 文件。

每个 STRM 文件：

1. 文件名用于作品/季/集识别。
2. 文件内容第一行必须是一个 HTTP(S) URL。
3. URL 应当是 Bridge 的**签名播放/解析地址**，而不是永久保存的115临时 CDN 地址。
4. HomeSphere 不解析 URL 内部参数，也不知道115 file_id、pickcode、Cookie 或 OAuth Token。

示例：

```text
/media/TV/Silo/Season 01/Silo.S01E01.strm
```

文件内容：

```text
https://media.example.com/play/<signed-token>
```

播放链路：

```text
iPhone
  ↓
HomeSphere /api/play/:id
  ↓ 302
https://media.example.com/play/<signed-token>
  ↓ 302
115 CDN temporary URL
  ↓
iPhone
```

因此 HomeSphere 不代理视频字节。

## Bridge 安全要求

推荐 Bridge 遵守以下约束：

- 优先使用官方可用的115授权/API能力。
- 只有 Bridge 持有115账号凭据。
- HomeSphere 容器不保存这些凭据。
- 管理接口不要直接暴露公网。
- 对外只暴露最小播放解析入口。
- 播放 URL 使用签名/不可猜 token。
- 点击播放时才解析临时 CDN URL。
- 不批量预生成直链。
- 目录同步低频、增量、有限重试。
- 不使用账号/IP轮换等规避限制的机制。
- Bridge 生成 STRM 时使用原子写入，避免 HomeSphere 扫到半写文件。

## STRM 目录安全

HomeSphere：

- 以只读 volume 挂载 `/media`。
- 不跟随符号链接。
- 只读取扩展名为 `.strm` 的文件。
- 单个 STRM 文件最大 16 KiB。
- 只接受 `http://` 或 `https://` URL。
- 可以通过 `HOMESPHERE_STRM_ALLOWED_HOSTS` 限定 Bridge 主机。
- 每次同步会删除 SQLite 中已经不存在的 STRM 条目。

## Bridge 实现不绑定

HomeSphere 故意不硬绑定 CloudDrive2、OpenStrm 或某个特定镜像。

只要某个服务能稳定完成：

```text
115 → STRM
点击URL → 302临时直链
```

并符合上面的契约，就可以作为 Media Bridge。

这样 HomeSphere 的 UI、SQLite、TMDB 和 IPTV 不需要跟随115接口实现变化。
