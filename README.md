# HomeSphere

HomeSphere 是一个私人家庭影视门户，面向本人、家人和少量朋友使用。

## 固定架构

HomeSphere **只认 STRM**。网盘账号、授权、目录同步和临时直链解析全部属于 Media Bridge 的职责，不进入 HomeSphere。

```text
115 / 其他存储
      │
      ▼
Media Bridge
  ├─ 持有存储授权
  ├─ 生成 STRM
  └─ 播放时返回 3xx
      │
      ├── /media/*.strm
      └── 内网解析端点
              │
              ▼
          HomeSphere
          ├─ SQLite
          ├─ TMDB
          ├─ 海报墙
          ├─ 推荐
          └─ IPTV
              │
              ▼
         iPhone / iPad
```

**项目边界：**

- HomeSphere 不保存 115 Cookie、OAuth Token 或网盘账号。
- HomeSphere 不调用 115/夸克等网盘 API。
- HomeSphere 不实现 Cloud Provider。
- HomeSphere 不代理视频字节。
- HomeSphere 不绑定 CloudDrive2、OpenStrm 或其他具体 Bridge。
- Bridge 只要满足 STRM + 3xx 契约即可替换。

详细契约：[`docs/MEDIA_BRIDGE_CONTRACT.md`](docs/MEDIA_BRIDGE_CONTRACT.md)  
115 保守部署：[`docs/BRIDGE_115_SAFE_PROFILE.md`](docs/BRIDGE_115_SAFE_PROFILE.md)  
验收标准：[`docs/BRIDGE_VALIDATION.md`](docs/BRIDGE_VALIDATION.md)

## 播放链路

STRM 第一行保存 Bridge 的内网 HTTP(S) 解析地址：

```text
http://media-bridge:12333/play/xxxx
```

播放时：

```text
iPhone
  │ GET /api/play/:id
  ▼
HomeSphere
  │ 内网请求
  ▼
Media Bridge
  │ 3xx → 最终 CDN URL
  ▼
HomeSphere
  │ 302
  ▼
iPhone ───────────────► CDN
```

视频字节不经过 HomeSphere。

## 当前功能

- 家庭密码登录与 30 天 HttpOnly Session
- iPhone / iPad / 桌面响应式 WebUI
- STRM 只读扫描
- SQLite 本地媒体索引
- 电影 / 剧集作品级归组
- 失效 STRM 清理
- TMDB 自动匹配、海报、简介、人工纠错
- Bridge allowlist、SSRF 防护和单条播放链路探测
- 豆瓣 / Bangumi / 影视热榜
- IPTV：M3U / EPG / 搜索 / 收藏 / 测活
- Docker 持久化

## STRM 目录

```text
/media/Movies/Dune.Part.Two.2024.strm
/media/TV/Silo/Season 01/Silo.S01E01.strm
/media/TV/Silo/Season 01/Silo.S01E02.strm
```

电视剧会按“作品 → 季 → 集”归组，不会一集一张海报。

HomeSphere：

- 不跟随符号链接；
- 只读取 `.strm`；
- 单个 STRM 最大 16 KiB；
- 只接受 HTTP(S)；
- STRM 目录以只读 volume 挂载；
- 普通浏览、搜索和 TMDB 展示都不访问 Bridge。

## 快速开始

```bash
cp .env.example .env
```

至少配置：

```env
PASSWORD=你的家庭访问密码
HOMESPHERE_STRM_PATH=./media
HOMESPHERE_STRM_ALLOWED_HOSTS=media-bridge
```

可选 TMDB：

```env
TMDB_API_TOKEN=你的_API_Read_Access_Token
TMDB_LANGUAGE=zh-CN
```

启动：

```bash
docker compose up -d --build
```

默认访问：

```text
http://服务器IP:8080
```

生产建议使用 HTTPS 反向代理，仅公开 HomeSphere。

## Docker 数据

```text
homesphere-data → /data
./media          → /media:ro
```

数据库：

```text
/data/homesphere.sqlite
```

## 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `PASSWORD` | 必填 | 家庭访问密码 |
| `PROXY_SECRET` | 从 PASSWORD 派生 | Session 签名 |
| `HOMESPHERE_STRM_PATH` | `./media` | 宿主机 STRM 目录 |
| `HOMESPHERE_STRM_ROOT` | `/media` | 容器内 STRM 根目录 |
| `HOMESPHERE_STRM_ALLOWED_HOSTS` | - | 允许访问的 Bridge 主机 |
| `HOMESPHERE_BRIDGE_TIMEOUT_MS` | 12000 | Bridge 解析超时 |
| `HOMESPHERE_BRIDGE_MAX_REDIRECTS` | 3 | Bridge 内部跳转上限 |
| `HOMESPHERE_SYNC_MAX_ENTRIES` | 30000 | 单次扫描条目上限 |
| `HOMESPHERE_SYNC_MAX_DIRS` | 5000 | 单次扫描目录上限 |
| `TMDB_API_TOKEN` | - | TMDB Read Access Token |
| `TMDB_LANGUAGE` | zh-CN | TMDB 返回语言 |
| `DEFAULT_LIVE_SOURCES` | - | IPTV M3U / EPG |
| `LIVE_ALLOW_PRIVATE` | 关闭 | 允许内网 IPTV |

## 开发验证

```bash
npm test
npm run typecheck
npm run build
```

## License

HomeSphere 基于 LibreTV 修改，继续遵循 **AGPL-3.0-or-later**。详见 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。

HomeSphere 不包含、托管或提供任何影视内容。
