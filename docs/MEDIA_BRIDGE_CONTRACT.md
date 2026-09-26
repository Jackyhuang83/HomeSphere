# Media Bridge Contract

HomeSphere 的生产默认架构把 115 账号能力与 WebUI 完全分离，并且 **Bridge 不需要暴露公网端口**。

```text
115 / 115open
     │
     ▼
Media Bridge
  ├─ 唯一持有115授权
  ├─ 低频/增量同步
  ├─ 生成 STRM
  └─ 点击播放时返回 302
     │
     ├── 写 STRM → /media
     │
     └── 内网解析端点
              ▲
              │ Docker / LAN only
        HomeSphere
        ├─ SQLite
        ├─ TMDB
        ├─ 海报墙
        └─ 登录鉴权
```

## STRM 契约

Bridge 在共享目录生成标准 `.strm`。

每个 STRM 文件：

1. 文件名用于作品 / 季 / 集识别。
2. 第一行必须是 HTTP(S) URL。
3. 推荐填写 **仅 HomeSphere 可访问的 Bridge 内网解析 URL**。
4. URL 不应是长期保存的115临时 CDN URL。
5. HomeSphere 不需要知道115 Cookie、OAuth Token 或账号密码。

示例：

```text
/media/TV/Silo/Season 01/Silo.S01E01.strm
```

内容可以是：

```text
http://media-bridge:12333/115/newurl?pickcode=xxxx
```

这里的 `media-bridge` 可以只是 Docker 网络中的服务名，客户端不需要访问它。

## 推荐播放链路：server resolve

```text
iPhone
  │
  │ GET /api/play/:id
  ▼
HomeSphere
  │
  │ 内网 GET STRM URL
  ▼
Media Bridge
  │
  │ 302 Location: https://115-cdn/temporary...
  ▼
HomeSphere
  │
  │ 302 最终 CDN URL
  ▼
iPhone ───────────────► 115 CDN
```

因此：

- Bridge 管理/解析端口不需要暴露公网。
- HomeSphere 不代理视频字节。
- HomeSphere 只请求 Bridge 的解析端点，不调用115 API。
- 最终电影字节仍是客户端直接从115 CDN获取。
- HomeSphere 使用客户端原始 User-Agent 请求 Bridge，便于兼容直链的 UA 绑定。

默认：

```env
HOMESPHERE_STRM_PLAYBACK_MODE=resolve
HOMESPHERE_STRM_ALLOWED_HOSTS=media-bridge
```

`resolve` 模式下如果没有配置允许主机，HomeSphere 会拒绝服务端解析，防止 STRM 被利用做 SSRF。

## Bridge 必须返回 3xx

HomeSphere 的生产模式只接受：

```text
Bridge → 3xx → 最终公网 CDN URL
```

如果 Bridge 返回 HTTP 200 并开始代理视频字节，HomeSphere 会报错，不会把视频流再代理一遍。

若 Bridge 内部还有一次相对跳转，HomeSphere 可以在允许的 Bridge 主机范围内跟随少量跳转；一旦跳到允许列表之外的公网地址，就把该地址视为最终 CDN 目标，不再由服务器继续下载。

## 最终 URL 安全检查

最终跳出 Bridge 的地址必须：

- 是 HTTP(S)；
- 不携带 URL 用户名/密码；
- 不能解析到回环、私有、链路本地或保留网段。

这用于阻止恶意或损坏的 STRM 把播放接口变成内网探测器。

## Bridge 安全要求

推荐 Bridge 遵守：

- 优先使用服务商官方开放授权 / API。
- 只有 Bridge 保存115授权。
- HomeSphere 容器不保存这些授权。
- 管理端口不暴露公网。
- 解析端点只放在 Docker 网络 / LAN。
- 点击播放时才解析临时 CDN URL。
- 不批量预生成直链。
- 目录同步低频、增量、有限重试。
- 不通过账号/IP轮换规避服务限制。
- STRM 使用原子写入，避免 HomeSphere 扫到半写文件。
- 若 Bridge 有“本地代理视频”功能，应关闭；HomeSphere 要求 302。

## STRM 目录安全

HomeSphere：

- 以只读 volume 挂载 `/media`；
- 不跟随符号链接；
- 只读取 `.strm`；
- 单文件最大 16 KiB；
- 只接受 HTTP(S)；
- 用 `HOMESPHERE_STRM_ALLOWED_HOSTS` 限制内网 Bridge；
- 同步后清理已经不存在的 STRM 本地索引。

## 兼容 direct 模式

少数 Bridge 本身提供安全的公网签名播放 URL，可显式切换：

```env
HOMESPHERE_STRM_PLAYBACK_MODE=direct
```

此时 HomeSphere 只做登录鉴权后 302 到 STRM URL，不会服务端访问 Bridge。

生产默认仍推荐 `resolve`。

## Bridge 实现不绑定

HomeSphere 不把核心绑定到某一个项目。只要 Bridge 能稳定完成：

```text
115 → STRM
STRM URL → 3xx → 临时 CDN URL
```

就符合接口。

Bridge 候选现状与选择原则见 `BRIDGE_OPTIONS.md`。
