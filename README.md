# HomeSphere

HomeSphere 是一个面向**本人 / 家人 / 少量朋友**使用的私人家庭影视门户。

项目从 LibreTV 精简而来，但已经移除公网 VOD 聚合、Apple CMS、多源点播搜索、TVBOX / SourceList 等体系。当前方向只有三件事：

1. **我的片库**：115 云盘作为主要媒体存储，本地 SQLite 只保存索引与元数据。
2. **影视发现**：豆瓣、Bangumi、影视热榜用于发现内容，不作为公网点播源。
3. **电视直播**：保留 IPTV 的 M3U、EPG、频道搜索、收藏、测活和直播播放器。

> 目标不是做公开影视站，而是做一个轻量、可维护、适合 iPhone / iPad / 浏览器访问的私人家庭媒体入口。

---

## 当前状态

当前版本：**0.1.0**

### 已完成

- 家庭密码登录
- 30 天 HttpOnly Session Cookie
- 整站 API 鉴权
- iPhone / iPad / 桌面响应式 WebUI
- 豆瓣 / Bangumi / 影视热榜
- IPTV：M3U / EPG / 搜索 / 收藏 / 最近观看 / 测活
- 115 Cloud Provider 抽象
- 115 指定目录只读扫描
- 本地 SQLite 媒体索引
- 电影 / 剧集作品级归组
- 手动同步 115 片库
- 登录后通过 `/api/play/:id` 获取 115 临时直链并 HTTP 302
- Docker `/data` 持久化
- GitHub Actions：test + typecheck + production build

### 下一阶段

- TMDB 自动识别、海报、简介与年份校正
- 人工纠错 / 指定 TMDB ID
- 推荐榜单 → “搜我的115”
- 更完整的点播播放器与字幕
- 增量同步 / 删除检测
- Quark Provider 接入（接口已预留）

---

## 架构

```text
                     HomeSphere
                        │
        ┌───────────────┼────────────────┐
        │               │                │
      发现页           私人片库           IPTV
 豆瓣/Bangumi/热榜      │           M3U / EPG / 测活
                        │
                   SQLite 本地索引
                        │
                仅同步 / 播放时访问115
                        │
                      115
                        │
        播放时返回临时直链 → HTTP 302
                        │
                   Browser / iPhone
```

核心原则：

> **静态数据本地化，115 只负责最后一公里的视频文件。**

日常浏览、搜索、分类都读取本地 SQLite，不会因为刷新海报墙反复扫描 115。只有手动同步和真正开始播放时才会访问 115。

---

## 115 数据模型

HomeSphere 不采用“一文件一海报”。

```text
作品 Work
├── 电影
│   └── 一个或多个视频版本
└── 剧集
    ├── Season 1
    │   ├── Episode 1
    │   ├── Episode 2
    │   └── ...
    └── Season 2
```

例如：

```text
Silo.S01E01.2160p.mkv
Silo.S01E02.2160p.mkv
Silo.S01E03.2160p.mkv
```

会归为一部 **Silo**，而不是三张海报。

当前文件名解析支持常见的：

- `S01E03`
- `1x03`
- `第1季第3集`
- 年份：`2024`
- 常见 2160p / 1080p / WEB-DL / BluRay / REMUX / HEVC 等标签清理

TMDB 阶段会进一步修正片名和元数据。

---

## 快速开始

### 本地开发

要求：

- Node.js 22+
- npm

```bash
git clone https://github.com/Jackyhuang83/HomeSphere.git
cd HomeSphere

cp .env.example .env
npm ci
npm run dev
```

默认访问：

```text
http://localhost:8080
```

本地 SQLite 默认写入：

```text
./.data/homesphere.sqlite
```

---

## Docker

### 1. 创建配置

```bash
cp .env.example .env
```

至少设置：

```env
PASSWORD=你的家庭访问密码
HOMESPHERE_115_COOKIE=你的115 Cookie
HOMESPHERE_115_MEDIA_DIRS=["/电影","/电视剧"]
```

### 2. 启动

```bash
docker compose up -d --build
```

数据持久化在 Docker volume：

```text
homesphere-data → /data
```

数据库文件：

```text
/data/homesphere.sqlite
```

升级镜像不会删除片库索引。

---

## 115 配置

### HOMESPHERE_115_COOKIE

当前 0.1.x 的 115 Provider 使用**只读 Cookie 方式**访问目录和获取播放直链。

Cookie 属于敏感凭据：

- 只放服务器 `.env`
- 不要写入 README
- 不要提交 GitHub
- 不要贴到 Issue / Actions log
- Cookie 失效后重新更新服务器环境变量即可

HomeSphere 的 Provider 层已经独立，后续如果切换到合适的 115 OpenAPI，不需要重写片库 UI 和 SQLite 数据模型。

### HOMESPHERE_115_MEDIA_DIRS

必须指定具体影视目录：

```env
HOMESPHERE_115_MEDIA_DIRS=["/Movies","/TV"]
```

也支持：

```env
HOMESPHERE_115_MEDIA_DIRS=/Movies,/TV
```

**不允许配置根目录 `/`。**

这是有意的保护：50TB 网盘如果误扫根目录，会产生大量目录请求，没有必要。

建议按媒体类型整理：

```text
/电影
/电视剧
/纪录片
```

然后只把真正需要进入 HomeSphere 的目录加入配置。

---

## 115 请求与同步策略

HomeSphere 当前采用保守策略：

- 只有手动点击“同步115”才扫描
- 单并发访问 115
- 默认请求间隔至少 500 ms
- 单次同步默认最多 30,000 个条目
- 单次同步默认最多 5,000 个目录
- 失败仅做有限重试与退避
- 浏览 / 搜索片库不访问 115
- 播放时才请求临时直链
- 不批量预生成播放 URL
- 不代理视频字节

相关配置：

```env
HOMESPHERE_115_MIN_INTERVAL_MS=500
HOMESPHERE_115_TIMEOUT_MS=15000
HOMESPHERE_SYNC_MAX_ENTRIES=30000
HOMESPHERE_SYNC_MAX_DIRS=5000
```

这些限制用于降低异常高频访问概率，但不能承诺第三方平台永远不会触发其自身限制。

---

## 播放路径

```text
iPhone / Browser
      │
      │ GET /api/play/<media-id>
      ▼
HomeSphere
      │
      │ 向115请求临时直链
      ▼
HTTP 302
      │
      ▼
115 CDN ───────────────► iPhone / Browser
```

HomeSphere 不作为电影字节的数据转发服务器，因此小型 VPS 也可以作为控制面。

当前页面先使用浏览器原生 `<video>` 验证 302 播放链路。MKV、特殊音视频编码、字幕等兼容性会在后续播放器阶段处理。

---

## 环境变量

| 变量 | 必需 | 默认 | 用途 |
|---|---|---|---|
| `PASSWORD` | 是 | - | 家庭访问密码 |
| `PROXY_SECRET` | 否 | 从 PASSWORD 派生 | Session 签名 |
| `COOKIE_SECURE` | 否 | 自动判断 | HTTPS Cookie |
| `HOMESPHERE_DATA_DIR` | 否 | 本地 `.data` / Docker `/data` | SQLite 数据目录 |
| `HOMESPHERE_115_COOKIE` | 片库需要 | - | 115 服务端凭据 |
| `HOMESPHERE_115_MEDIA_DIRS` | 片库需要 | - | 要索引的115目录 |
| `HOMESPHERE_115_MIN_INTERVAL_MS` | 否 | 500 | 115 最小请求间隔 |
| `HOMESPHERE_115_TIMEOUT_MS` | 否 | 15000 | 115 单请求超时 |
| `HOMESPHERE_SYNC_MAX_ENTRIES` | 否 | 30000 | 单次同步条目保护阈值 |
| `HOMESPHERE_SYNC_MAX_DIRS` | 否 | 5000 | 单次同步目录保护阈值 |
| `DEFAULT_LIVE_SOURCES` | 否 | - | 预置 IPTV M3U / EPG |
| `LIVE_ALLOW_PRIVATE` | 否 | 关闭 | 允许内网 IPTV 源 |
| `60S_API_BASE` | 否 | 公共实例 | 影视热榜 API |

---

## 安全边界

HomeSphere 按私人家庭服务设计：

- 未登录用户不能访问片库 API
- `/api/play/:id` 必须有有效 Session
- Cookie 使用 HttpOnly + SameSite=Lax
- HTTPS 环境使用 Secure Cookie
- 登录有基础速率限制
- `robots.txt` 禁止搜索引擎抓取
- IPTV / 图片代理保留 SSRF 防护
- 115 Cookie 只存在服务器环境变量
- 数据库不保存家庭登录密码，也不保存115 Cookie

建议始终通过 HTTPS 访问生产实例。

---

## 项目结构

```text
src/
├── app/
│   ├── library/           # 私人片库 WebUI
│   ├── live/              # IPTV
│   └── api/
│       ├── library/       # 本地片库 / 同步
│       ├── play/          # 115 302播放
│       └── live/          # IPTV API
├── lib/
│   ├── cloud/
│   │   ├── provider.ts    # Provider 接口
│   │   └── providers/
│   │       └── 115.ts
│   └── library/
│       ├── db.ts          # SQLite
│       ├── media-name.ts  # 文件名解析
│       └── sync.ts        # 手动索引
└── components/
```

Provider 从第一天就按多云抽象：

```text
CloudProvider
├── 115     ← 当前启用
└── Quark   ← 接口预留，尚未启用
```

---

## 开发验证

```bash
npm test
npm run typecheck
npm run build
```

GitHub Actions 会在 PR / main 上执行同样的核心检查。

---

## License / Upstream

HomeSphere 基于 LibreTV 修改，项目继续遵循 **AGPL-3.0-or-later**。

上游：

- LibreTV: https://github.com/LibreSpark/LibreTV
- OpenStrm: https://github.com/indown/openStrm

115 Provider 的设计参考 OpenStrm；115 下载链接加解密实现由 OpenStrm MIT 代码适配而来。详见：

- `LICENSE`
- `THIRD_PARTY_NOTICES.md`

HomeSphere 不包含、托管或提供任何影视内容，媒体文件来自部署者自行配置的私人存储。
