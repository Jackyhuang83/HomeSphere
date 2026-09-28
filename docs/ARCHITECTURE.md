# HomeSphere 架构说明

## 1. 一句话定义

HomeSphere 是私人家庭影视前端与本地媒体索引。

它的媒体边界只有一个：

```text
STRM + Media Bridge 3xx
```

HomeSphere 不直接实现任何网盘客户端。

## 2. 组件职责

### Media Bridge

负责：

- 负责 115 授权接入；
- 读取指定媒体目录；
- 生成 STRM；
- 播放时解析临时下载地址；
- 返回 3xx。

当前默认部署使用轻量 q115-strm。

Bridge 属于部署层，只要满足本文契约，未来可以替换而不修改 HomeSphere 核心。

### HomeSphere

负责：

- 家庭登录；
- STRM 扫描；
- SQLite 本地索引；
- 作品 / 季 / 集归组；
- TMDB 元数据；
- 推荐与发现；
- IPTV；
- 播放入口；
- Bridge 访问保护。

## 3. 入库数据流

```text
115
 │
 ▼
Media Bridge
 │
 └─ 生成 .strm
      │
      ▼
   /media
      │ 只读
      ▼
 HomeSphere
      │
      ▼
   SQLite
```

HomeSphere 扫描的是本地 STRM，不是115目录。

因此正常的：

- 首页；
- 片库浏览；
- 搜索；
- TMDB 海报；
- 推荐匹配；

都不需要访问115。

## 4. STRM 契约

每个 `.strm`：

- 文件名用于识别作品 / 季 / 集；
- 第一行必须是 HTTP(S) URL；
- URL 应指向仅 HomeSphere 可以访问的 Bridge 解析端点；
- 不应把长期临时 CDN URL 固化到 STRM；
- 单个 STRM 最大 16 KiB；
- HomeSphere 不跟随本地符号链接。

示例：

```text
/media/TV/Silo/Season 01/Silo.S01E01.strm
```

内容示意：

```text
http://media-bridge:12333/play/xxxx
```

## 5. 播放数据流

```text
Client
  │ GET /api/play/:id
  ▼
HomeSphere
  │ server-side request
  ▼
Media Bridge
  │ 3xx
  ▼
public CDN URL
  │
  ▼
HomeSphere 302
  │
  ▼
Client ─────────────► CDN
```

视频内容不经过 HomeSphere。

如果 Bridge 返回 HTTP 200 视频内容，HomeSphere 会拒绝该链路。

## 6. 网络边界

### 对公网

只需要公开：

```text
HomeSphere HTTPS
```

### 不对公网

Bridge 管理 / 解析端口保持在 Docker / VPS 私有网络。

当前部署模板只把 Bridge 管理端口绑定到：

```text
127.0.0.1:12333
```

需要管理时使用 SSH 隧道。

## 7. SSRF 防护

HomeSphere 不信任 STRM 中的任意 URL。

播放前会：

1. 验证协议只能是 HTTP(S)；
2. 验证 Bridge 主机必须在 `HOMESPHERE_STRM_ALLOWED_HOSTS`；
3. Bridge 内部跳转只允许有限次数；
4. 最终地址必须通过公网地址安全检查；
5. 拒绝最终跳转到回环、私有、链路本地或保留地址。

这样 STRM 不能把 HomeSphere 随意变成内网请求跳板。

## 8. 115 请求保护

实际115调用发生在 Bridge。

HomeSphere 额外约束 Bridge 解析请求：

```text
全局串行
   ↓
最小间隔 1 秒
   ↓
相同 STRM + UA 短缓存 60 秒
   ↓
429 / 5xx
   ↓
熔断 60 秒
```

原则：

- 不批量预生成播放直链；
- 点击播放时才解析；
- 不并发轰炸 Bridge；
- 不对429进行自动密集重试；
- 不试图绕过第三方平台限制。

这些措施用于降低异常流量和账号风险，不构成账号安全保证。

## 9. 为什么不让视频经过 VPS

当前 VPS：

```text
10 Mbps
```

一部高码率影片即可轻易超过该带宽。

因此 HomeSphere 的设计必须保证：

```text
VPS = 控制面
CDN = 数据面
```

VPS 只处理：

- HTML / JS / CSS；
- API；
- SQLite；
- STRM；
- 302。

不处理：

- 视频转码；
- 视频 relay；
- 视频缓存；
- 大文件下载。

## 10. 直播数据流

直播与 115 点播遵循同一个原则：

```text
VPS = 控制面
源站 / CDN = 数据面
```

HomeSphere 可以在服务端拉取和解析 M3U 文本、EPG 和少量测活数据，但实际直播视频必须由浏览器直接连接上游源站。

```text
Client
  │ GET /api/live/playlist
  ▼
HomeSphere
  │ 拉取 M3U 文本
  ▼
公共 / 自定义 M3U
  │
  ▼
返回频道清单
  │
  ▼
Client ─────────────► 直播源站
```

直播播放器采用 Direct-only：

- 不提供 `/api/live/stream/` 视频代理；
- HLS / FLV / 原生媒体都由浏览器直接访问；
- 直连失败时不会自动改走 VPS 或 Cloudflare Tunnel；
- 可在设置中安装公共 M3U 主/备订阅；
- 默认主源为 iptv-org News 分类；
- 备用源为 Free-TV/IPTV，默认安装但停用；
- 外部 M3U 只作为频道发现与清单来源，不改变视频数据面边界。

## 11. 非目标

HomeSphere 核心明确不做：

- 115 Direct Provider；
- Quark Provider；
- CloudDrive2 挂载；
- Cookie 私有 API 兼容层；
- 网盘文件管理；
- 自动移动 / 重命名 / 删除云盘文件；
- 视频转码；
- 视频代理；
- Emby / Jellyfin / Plex 服务端能力。

这样可以防止项目再次向多个媒体架构分叉。

## 12. 数据模型

HomeSphere 把媒体分成两层：

```text
Work
 └─ Media
```

### Work

一部电影或一部电视剧。

例如：

```text
Silo
```

### Media

具体文件 / 集数。

例如：

```text
Silo.S01E01
Silo.S01E02
```

因此电视剧不会一集生成一张作品海报。

## 13. 可替换 Bridge 的最低要求

任何替代 Bridge 必须同时满足：

- 可以生成本地 STRM；
- STRM 指向私有 HTTP(S) 解析地址；
- 解析端点返回 3xx；
- 最终地址可由客户端直接访问；
- 不要求 HomeSphere 直接接入云盘认证；
- 不要求 HomeSphere 代理视频字节；
- 能接受保守限速；
- 可以只读使用。

满足这些条件即可接入，不需要在 HomeSphere 增加新的 Provider 抽象。
