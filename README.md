# HomeSphere

HomeSphere 是一个面向**本人 / 家人 / 少量朋友**的私人家庭影视门户。

项目从 LibreTV 精简而来，已经移除公网 VOD 聚合、Apple CMS、多源点播搜索、TVBOX / SourceList 等体系。HomeSphere 当前只负责三件事：

1. **私人片库**：读取本地 STRM，使用 SQLite + TMDB 构建海报墙。
2. **影视发现**：豆瓣、Bangumi、影视热榜用于发现内容，不作为公网点播源。
3. **电视直播**：M3U、EPG、频道搜索、收藏、测活和直播播放器。

> 生产默认原则：**HomeSphere 不直接持有115账号凭据，也不扫描115网盘；Media Bridge 不需要暴露公网。**

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
        ┌────────────┴────────────┐
        │ STRM 只读目录            │ 内网解析端点
        ▼                         ▲
     /media                       │
        │                         │
        └──────────┬──────────────┘
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

播放时 HomeSphere 在服务器内部调用 Bridge，只取它返回的最终 CDN `Location`，然后把该 CDN URL 302 给客户端。Bridge 的管理/解析端口无需暴露互联网。

详细接口：[`docs/MEDIA_BRIDGE_CONTRACT.md`](docs/MEDIA_BRIDGE_CONTRACT.md)  
Bridge 选择记录：[`docs/BRIDGE_OPTIONS.md`](docs/BRIDGE_OPTIONS.md)  
Bridge 验收标准：[`docs/BRIDGE_VALIDATION.md`](docs/BRIDGE_VALIDATION.md)  
CloudDrive2 探针：[`docs/CD2_PROBE.md`](docs/CD2_PROBE.md)

---

## 播放链路

STRM 可以保存 Docker 内网地址：

```text
http://media-bridge:12333/115/newurl?pickcode=xxxx
```

实际播放：

```text
iPhone
  │ GET /api/play/:id
  ▼
HomeSphere
  │ 内网请求（携带同一 User-Agent）
  ▼
Media Bridge
  │ 302
  ▼
HomeSphere 取得最终 115 CDN URL
  │ 302
  ▼
iPhone ───────────────────► 115 CDN
```

因此：

- HomeSphere 不知道115 Cookie/OAuth Token；
- Bridge 无需开放公网端口；
- 视频字节不经过 HomeSphere；
- 日常浏览/搜索不会访问 Bridge 或115。

---

## 当前状态

当前版本：**0.1.x**

已完成：

- 家庭密码登录 + 30天 HttpOnly Session
- 整站 API 鉴权
- iPhone / iPad / 桌面响应式 WebUI
- 豆瓣 / Bangumi / 影视热榜
- IPTV：M3U / EPG / 搜索 / 收藏 / 最近观看 / 测活
- STRM 生产默认片库
- SQLite 本地作品/文件索引
- 电影 / 剧集作品级归组
- 失效 STRM 本地索引清理
- TMDB 自动匹配 + 人工纠错
- **内网 Media Bridge 服务端解析**
- 最终 CDN 302，不代理视频字节
- Bridge 主机 allowlist
- Bridge 静态安全状态卡
- 手动真实播放链路探测（30秒限频，不回显临时URL）
- STRM 模式残留115 Cookie 安全告警
- 最终公网 URL SSRF 校验
- Docker `/data` 持久化 + `/media:ro`
- 115 Direct 仅高级兼容模式

下一阶段：

- 使用内置 CD2 探针验证 115open 直链的 Safari 兼容性
- 完成一个 Bridge 的真实端到端验证
- 推荐榜单 → “搜我的片库”
- 更完整播放器与字幕
- STRM/NFO/字幕协同
- Quark Bridge 后端预留

---

## STRM 约定

```text
/media/Movies/Dune.Part.Two.2024.strm
/media/TV/Silo/Season 01/Silo.S01E01.strm
/media/TV/Silo/Season 01/Silo.S01E02.strm
```

每个 STRM 第一行是 Bridge 的 HTTP(S) 解析 URL。

HomeSphere：

- 不跟随符号链接；
- 只读 `.strm`；
- 单文件最大16KiB；
- 只接受 HTTP(S)；
- 默认要求 Bridge host allowlist；
- SQLite 按“作品 → 季/集 → STRM”归组。

---

## 快速开始

```bash
cp .env.example .env
```

至少设置：

```env
PASSWORD=你的家庭访问密码

HOMESPHERE_LIBRARY_MODE=strm
HOMESPHERE_STRM_PATH=./media

# 推荐生产模式
HOMESPHERE_STRM_PLAYBACK_MODE=resolve
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

HomeSphere：

```text
http://服务器IP:8080
```

生产建议由 HTTPS 反向代理只暴露 HomeSphere。

---

## Docker 挂载

```text
homesphere-data → /data
./media          → /media:ro
```

`media/` 已加入 Git/Docker ignore，避免 STRM 内容误进入仓库或镜像。

Media Bridge 后续部署在同一 Docker 网络时，不需要映射它的解析端口到宿主机公网。

---

## 播放模式

### resolve（默认推荐）

```env
HOMESPHERE_STRM_PLAYBACK_MODE=resolve
HOMESPHERE_STRM_ALLOWED_HOSTS=media-bridge
```

HomeSphere 服务端调用 Bridge。

安全约束：

- allowlist 必填；
- 只跟随 allowlist 内的少量内部跳转；
- 最终跳出 Bridge 的 URL 必须为公网 HTTP(S)；
- Bridge 返回 200 视频字节时拒绝；
- 最终 CDN 地址通过安全检查后才 302。

### direct（兼容）

如果 STRM 本身是客户端可直接访问的安全签名 URL：

```env
HOMESPHERE_STRM_PLAYBACK_MODE=direct
```

此时 HomeSphere 只做登录鉴权后跳转。

---

## Bridge 自检

片库页会显示 **Media Bridge** 状态卡。

静态检查不会访问115或Bridge，检查：

- STRM目录是否可读；
- 当前是否为resolve模式；
- Bridge allowlist是否配置；
- HomeSphere环境中是否错误残留115 Cookie；
- 是否已经有可用于探测的STRM。

同步至少一个STRM后，可以手动点击“测试播放链路”。

该操作：

- 只测试一条STRM；
- 全局至少间隔30秒；
- 会真实调用一次内网Bridge解析；
- 只显示Bridge主机、最终CDN主机和耗时；
- 不向浏览器返回完整115临时URL；
- 不读取视频字节。

完整验收步骤见 `docs/BRIDGE_VALIDATION.md`。

---

## CloudDrive2 兼容性探针

CloudDrive2 是目前优先验证的115open底层，但 HomeSphere **不会因为它能返回 directUrl 就直接假定浏览器可播放**。CD2 的官方 gRPC 同时会返回推荐 User-Agent 与额外 Header；普通浏览器的302跳转无法任意添加这些 Header。

因此 HomeSphere 提供一个只读诊断页：

```text
/library/cd2
```

服务器环境变量：

```env
HOMESPHERE_CD2_ENDPOINT=http://clouddrive:19798
HOMESPHERE_CD2_TOKEN=限目录只读API令牌
HOMESPHERE_CD2_PROBE_PATH=/你的CD2媒体根/测试文件.mp4
```

探针调用 CloudDrive2 官方 `GetDownloadUrlPath(get_direct_url=true)`，浏览器只会看到：

- 是否返回 directUrl；
- 临时直链的主机名；
- 是否要求特定 User-Agent；
- 额外 Header 的**名称**；
- 是否具备浏览器302候选条件。

不会返回：

- CD2 Token；
- 完整临时直链；
- Header 值。

只有当“无额外 Header + UA 与当前浏览器一致 + 目标为公网 HTTP(S)”时，页面才开放一次 iPhone/Safari 的真实302测试。

详见 `docs/CD2_PROBE.md`。

---

## TMDB

```env
TMDB_API_TOKEN=...
TMDB_LANGUAGE=zh-CN
```

```text
同步STRM
  ↓
SQLite
  ↓
整理海报
  ↓
TMDB
  ├─ 高/中置信 → 自动入库
  └─ 低置信/失败 → 人工修正
```

普通片库浏览不访问 TMDB。

---

## 生产安全边界

HomeSphere 默认：

- 不保存115凭据；
- 不调用115目录/下载 API；
- 不代理视频字节；
- Bridge 端口可完全内网化；
- STRM 目录只读；
- 服务端 Bridge 请求受 host allowlist 限制；
- 最终 CDN 地址拒绝私网/保留网段；
- 登录后的 `/api/play/:id` 才能触发解析；
- 不批量预解析播放链接。

Media Bridge 是唯一应该持有115授权的组件。

这降低了重复和异常调用面，但不能承诺第三方服务永远不会触发其自身限制。

---

## 高级兼容：115 Direct

仅开发/排障需要时：

```env
HOMESPHERE_LIBRARY_MODE=direct115
HOMESPHERE_115_COOKIE=...
HOMESPHERE_115_MEDIA_DIRS=["/电影","/电视剧"]
```

它不是正式交付默认路径。

---

## 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `PASSWORD` | 必填 | 家庭访问密码 |
| `HOMESPHERE_LIBRARY_MODE` | `strm` | `strm` / `direct115` |
| `HOMESPHERE_STRM_PATH` | `./media` | 宿主机 STRM 目录 |
| `HOMESPHERE_STRM_ROOT` | `/media` | 容器内 STRM 目录 |
| `HOMESPHERE_STRM_PLAYBACK_MODE` | `resolve` | Bridge 服务端解析 / direct |
| `HOMESPHERE_STRM_ALLOWED_HOSTS` | - | resolve 模式允许的 Bridge 主机 |
| `HOMESPHERE_BRIDGE_TIMEOUT_MS` | 12000 | Bridge 解析超时 |
| `HOMESPHERE_BRIDGE_MAX_REDIRECTS` | 3 | 内部跳转上限 |
| `HOMESPHERE_CD2_ENDPOINT` | - | 可选 CD2 gRPC endpoint |
| `HOMESPHERE_CD2_TOKEN` | - | 限目录、只读 CD2 API Token |
| `HOMESPHERE_CD2_PROBE_PATH` | - | CD2 直链兼容性测试文件 |
| `HOMESPHERE_CD2_TIMEOUT_MS` | 8000 | CD2 探针超时 |
| `HOMESPHERE_DATA_DIR` | Docker `/data` | SQLite |
| `TMDB_API_TOKEN` | - | TMDB Read Access Token |
| `TMDB_LANGUAGE` | `zh-CN` | TMDB 返回语言 |
| `DEFAULT_LIVE_SOURCES` | - | IPTV M3U / EPG |
| `LIVE_ALLOW_PRIVATE` | 关闭 | 允许内网 IPTV |

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

Direct115 兼容 Provider 的部分设计/加解密实现参考或适配自 OpenStrm MIT；详见 `THIRD_PARTY_NOTICES.md`。

HomeSphere 不包含、托管或提供任何影视内容。
