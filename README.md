# HomeSphere

HomeSphere 是一个面向**本人 / 家人 / 少量朋友**的私人家庭影视门户。

项目从 LibreTV 精简而来，已经移除公网 VOD 聚合、Apple CMS、多源点播搜索、TVBOX / SourceList 等体系。HomeSphere 当前只负责三件事：

1. **私人片库**：读取本地 STRM 索引，使用 SQLite + TMDB 构建海报墙。
2. **影视发现**：豆瓣、Bangumi、影视热榜用于发现内容，不作为公网点播源。
3. **电视直播**：M3U、EPG、频道搜索、收藏、测活和直播播放器。

> 生产默认原则：**HomeSphere 不直接持有115账号凭据，也不扫描115网盘。**

---

## 推荐架构

```text
                    115
                     │
               官方授权/API
                     │
              ┌──────▼──────┐
              │ Media Bridge│
              │             │
              │ ·115授权     │
              │ ·增量同步    │
              │ ·生成STRM    │
              │ ·播放时302   │
              └──────┬──────┘
                     │
               STRM 只读目录
                     │
              ┌──────▼──────┐
              │ HomeSphere  │
              │             │
              │ SQLite      │
              │ TMDB        │
              │ 海报墙       │
              │ 推荐        │
              │ IPTV        │
              └──────┬──────┘
                     │
                 iPhone/iPad
```

职责严格分离：

| 组件 | 接触115凭据 | 扫描115 | 保存元数据 | WebUI |
|---|---:|---:|---:|---:|
| Media Bridge | 是 | 是 | 仅生成STRM所需 | 否 |
| HomeSphere | **否** | **否** | SQLite/TMDB | 是 |

详细接口契约见：[`docs/MEDIA_BRIDGE_CONTRACT.md`](docs/MEDIA_BRIDGE_CONTRACT.md)。

---

## 为什么默认使用 STRM

日常操作：

```text
打开首页
翻海报
搜索
分类
查看详情
```

全部只发生在：

```text
HomeSphere → SQLite / TMDB
```

不会产生115目录请求。

只有两类动作涉及 Media Bridge：

- Bridge 自己的低频/增量目录同步；
- 用户真正点击播放。

这比让 WebUI、媒体整理器和其他工具分别访问115更简单，也更容易控制调用面。

---

## 播放链路

STRM 文件内容保存 Bridge 的签名解析 URL，例如：

```text
https://media.example.com/play/<signed-token>
```

播放时：

```text
iPhone / Browser
       │
       │ GET /api/play/<media-id>
       ▼
HomeSphere
       │
       │ 302
       ▼
Media Bridge signed play URL
       │
       │ 302
       ▼
115 CDN temporary URL
       │
       ▼
iPhone / Browser
```

HomeSphere 不代理视频字节，也不需要115 Cookie、Token、file_id 或 pickcode。

---

## 当前状态

当前版本：**0.1.x**

### 已完成

- 家庭密码登录
- 30 天 HttpOnly Session Cookie
- 整站 API 鉴权
- iPhone / iPad / 桌面响应式 WebUI
- 豆瓣 / Bangumi / 影视热榜
- IPTV：M3U / EPG / 搜索 / 收藏 / 最近观看 / 测活
- **STRM 作为生产默认片库来源**
- STRM 只读目录扫描
- SQLite 本地作品/文件索引
- 电影 / 剧集作品级归组
- 删除失效 STRM 的本地索引清理
- TMDB 自动匹配、海报、背景图与简介
- 低置信匹配人工纠错
- 登录后播放 302
- Docker `/data` 持久化
- Docker 只读 `/media` STRM 挂载
- 115 Direct 保留为高级兼容模式
- GitHub Actions：test + typecheck + production build

### 下一阶段

- 推荐榜单 → “搜我的片库”
- 更完整的播放器与字幕
- Bridge 实现/部署模板验证
- STRM/NFO/字幕协同
- Quark 作为未来 Bridge 后端来源之一

---

## STRM 数据模型

HomeSphere 不采用“一文件一海报”。

```text
作品 Work
├── 电影
│   └── 一个或多个 STRM
└── 剧集
    ├── Season 01
    │   ├── S01E01.strm
    │   └── S01E02.strm
    └── Season 02
```

例如：

```text
/media/TV/Silo/Season 01/Silo.S01E01.strm
/media/TV/Silo/Season 01/Silo.S01E02.strm
/media/TV/Silo/Season 01/Silo.S01E03.strm
```

会归成一部 **Silo**，而不是三张海报。

支持常见命名：

- `S01E03`
- `1x03`
- `第1季第3集`
- 年份 `2024`
- 常见 2160p / 1080p / WEB-DL / BluRay / REMUX / HEVC 标签清理

---

## 快速开始

### 1. 准备 STRM 目录

例如宿主机：

```text
./media/
├── Movies/
│   └── Dune.Part.Two.2024.strm
└── TV/
    └── Silo/
        └── Season 01/
            ├── Silo.S01E01.strm
            └── Silo.S01E02.strm
```

每个 `.strm` 第一行是 Bridge 的 HTTP(S) 播放解析 URL。

### 2. 配置 HomeSphere

```bash
cp .env.example .env
```

至少设置：

```env
PASSWORD=你的家庭访问密码
HOMESPHERE_LIBRARY_MODE=strm
HOMESPHERE_STRM_PATH=./media

# 推荐生产设置：只允许自己的 Bridge 主机
HOMESPHERE_STRM_ALLOWED_HOSTS=media.example.com
```

TMDB 可选：

```env
TMDB_API_TOKEN=你的_API_Read_Access_Token
TMDB_LANGUAGE=zh-CN
```

### 3. 启动

```bash
docker compose up -d --build
```

访问：

```text
http://服务器IP:8080
```

生产环境建议通过 HTTPS 反向代理访问。

---

## Docker 挂载

```text
homesphere-data → /data
./media          → /media:ro
```

- `/data/homesphere.sqlite`：HomeSphere 本地数据库。
- `/media`：Bridge 输出的 STRM，只读挂载。

`media/` 已加入 `.gitignore` 与 `.dockerignore`，避免带签名的 STRM URL 被提交到 GitHub 或打入镜像。

---

## TMDB

HomeSphere 使用 TMDB v3 API Read Access Token。

```env
TMDB_API_TOKEN=...
TMDB_LANGUAGE=zh-CN
```

流程：

```text
同步STRM
   ↓
本地作品索引
   ↓
整理海报
   ↓
TMDB
   ├─ 高/中置信 → 自动写入
   └─ 低置信/失败 → 人工修正
```

TMDB 请求不会发生在普通片库浏览过程中。

---

## 生产安全边界

HomeSphere 默认：

- 不保存115 Cookie/OAuth Token。
- 不调用115目录接口。
- 不生成115临时直链。
- 不代理视频字节。
- STRM 目录只读。
- 不跟随 STRM 目录中的符号链接。
- 单个 STRM 最大 16 KiB。
- STRM 只允许 HTTP(S)。
- 可配置 `HOMESPHERE_STRM_ALLOWED_HOSTS`。
- 登录后的 `/api/play/:id` 才允许播放跳转。
- `robots.txt` 禁止搜索引擎抓取。

Media Bridge 是唯一应该持有115授权的服务。

这套设计**降低重复和异常调用面，但不能承诺第三方服务永远不会触发其自身限制**。

---

## 高级兼容：115 Direct

仓库仍保留之前已经验证编译通过的 Direct 115 Provider，主要用于开发、排障和兼容。

它**不是生产默认模式**。

只有显式配置：

```env
HOMESPHERE_LIBRARY_MODE=direct115
HOMESPHERE_115_COOKIE=...
HOMESPHERE_115_MEDIA_DIRS=["/电影","/电视剧"]
```

HomeSphere 才会直接访问115。

切回生产推荐模式：

```env
HOMESPHERE_LIBRARY_MODE=strm
```

STRM 与 Direct 115 使用不同 provider namespace，因此数据库里不会把两种来源混在同一海报列表中。

---

## 环境变量

| 变量 | 必需 | 默认 | 用途 |
|---|---|---|---|
| `PASSWORD` | 是 | - | 家庭访问密码 |
| `PROXY_SECRET` | 否 | 从 PASSWORD 派生 | Session 签名 |
| `COOKIE_SECURE` | 否 | 自动判断 | HTTPS Cookie |
| `HOMESPHERE_LIBRARY_MODE` | 否 | `strm` | `strm` / `direct115` |
| `HOMESPHERE_STRM_PATH` | Docker | `./media` | 宿主机 STRM 目录 |
| `HOMESPHERE_STRM_ROOT` | 否 | `/media` | 容器内 STRM 根目录 |
| `HOMESPHERE_STRM_ALLOWED_HOSTS` | 推荐 | 空 | 允许的 Bridge 主机 |
| `HOMESPHERE_DATA_DIR` | 否 | 本地 `.data` / Docker `/data` | SQLite |
| `HOMESPHERE_SYNC_MAX_ENTRIES` | 否 | 30000 | 单次扫描条目上限 |
| `HOMESPHERE_SYNC_MAX_DIRS` | 否 | 5000 | 单次扫描目录上限 |
| `TMDB_API_TOKEN` | 海报整理需要 | - | TMDB Token |
| `TMDB_LANGUAGE` | 否 | zh-CN | TMDB 语言 |
| `DEFAULT_LIVE_SOURCES` | 否 | - | IPTV M3U / EPG |
| `LIVE_ALLOW_PRIVATE` | 否 | 关闭 | 允许内网 IPTV |

115 Direct 的变量只在高级兼容模式使用，详见 `.env.example`。

---

## 项目结构

```text
src/
├── app/
│   ├── library/
│   ├── live/
│   └── api/
│       ├── library/
│       ├── play/
│       └── live/
├── lib/
│   ├── library/
│   │   ├── mode.ts       # STRM / Direct115 模式
│   │   ├── strm.ts       # STRM 扫描与URL校验
│   │   ├── db.ts
│   │   ├── sync.ts
│   │   └── media-name.ts
│   ├── tmdb/
│   └── cloud/            # 仅高级兼容 Provider
└── components/
```

---

## 开发验证

```bash
npm test
npm run typecheck
npm run build
```

---

## License / Upstream

HomeSphere 基于 LibreTV 修改，继续遵循 **AGPL-3.0-or-later**。

- LibreTV: https://github.com/LibreSpark/LibreTV
- OpenStrm: https://github.com/indown/openStrm

Direct 115 兼容 Provider 的部分设计与加解密实现参考/适配自 OpenStrm MIT 代码；详见 `THIRD_PARTY_NOTICES.md`。

HomeSphere 不包含、托管或提供任何影视内容。
