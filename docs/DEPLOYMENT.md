# HomeSphere 部署指南

本文只描述当前推荐部署：

```text
115 + 一台 VPS + HomeSphere + 轻量 Media Bridge
```

不需要 NAS、Mac mini、CloudDrive2、Emby、Jellyfin 或 Plex。

## 1. 目标机器

当前目标：

```text
1 vCPU
1 GB RAM
50 GB SSD
10 Mbps
115 会员 / 约 50 TB
```

这个配置适合 HomeSphere 与轻量 Bridge 的控制面工作。

**不适合：**

- 视频转码；
- 视频中继；
- 把电影下载到 VPS；
- 把 VPS 当媒体存储。

正常播放时，视频应由最终 CDN 直接传给 iPhone / iPad。

## 2. 目录

在 VPS 上进入 HomeSphere 项目目录后：

```bash
mkdir -p bridge-config media
cp .env.example .env
```

用途：

```text
bridge-config/   Bridge 配置与本地数据
media/           Bridge 生成的 STRM
/data            HomeSphere SQLite（Docker volume）
```

原始视频不保存在这些目录。

## 3. HomeSphere 基础配置

编辑 `.env`，至少设置：

```env
PASSWORD=你的家庭访问密码

HOMESPHERE_STRM_PATH=./media
HOMESPHERE_STRM_ALLOWED_HOSTS=media-bridge
```

推荐保持保守默认值：

```env
HOMESPHERE_BRIDGE_TIMEOUT_MS=12000
HOMESPHERE_BRIDGE_MAX_REDIRECTS=3
HOMESPHERE_BRIDGE_MIN_INTERVAL_MS=1000
HOMESPHERE_BRIDGE_CACHE_TTL_MS=60000
HOMESPHERE_BRIDGE_CIRCUIT_MS=60000
```

可选 TMDB：

```env
TMDB_API_TOKEN=你的_API_Read_Access_Token
TMDB_LANGUAGE=zh-CN
```

没有 TMDB 也可以使用片库，只是不会自动补海报和简介。

## 4. 启动

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.bridge.yml \
  up -d
```

检查：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.bridge.yml \
  ps
```

HomeSphere：

```text
http://服务器IP:8080
```

Bridge 管理端口默认只绑定 VPS 本机：

```text
127.0.0.1:12333
```

不要把 12333 直接开放公网。

## 5. 第一次进入 Bridge

从自己的电脑建立 SSH 隧道：

```bash
ssh -L 12333:127.0.0.1:12333 root@你的VPS_IP
```

浏览器打开：

```text
http://127.0.0.1:12333
```

当前部署模板使用轻量 `qicfan/115strm` Bridge。

首次进入后：

1. 立即修改默认管理密码；
2. 在 Bridge 内完成115授权；
3. 只选择真正存影视的目录；
4. 不扫描115整个根目录。

例如：

```text
/电影
/电视剧
```

115 凭据不要写进 HomeSphere 的 `.env`，也不要提交到 GitHub。

## 6. Bridge 保守设置

HomeSphere 只需要 Bridge 做三件事：

1. 读取115媒体目录；
2. 生成 / 更新 STRM；
3. 点击播放时解析临时直链并返回 3xx。

不需要的功能保持关闭：

- 视频代理 / relay / 中继；
- 自动上传元数据到115；
- 自动移动115文件；
- 自动重命名115文件；
- 自动删除115文件；
- 与 HomeSphere 无关的下载、转存和自动化任务。

### 同步频率

第一次：

- 手动执行一次全量同步；
- 不并行启动多个全量任务。

日常：

- 推荐每 **6 小时**同步一次；
- 新增影片后可以手动同步；
- 不需要高频轮询。

Bridge 自身如果出现请求限制，应停下来等待，不要通过提高并发或密集重试规避平台限制。

## 7. HomeSphere 建立片库

登录 HomeSphere 后打开：

```text
/setup
```

页面会检查：

1. Bridge 是否配置；
2. STRM 目录是否可读；
3. 本地片库是否已有索引；
4. TMDB 是否配置（可选）。

然后进入：

```text
片库 → 同步STRM
```

HomeSphere 会把 STRM 建成本地 SQLite 索引。

普通浏览、搜索和 TMDB 展示都不会访问115。

## 8. 播放链路测试

片库页点击：

```text
测试播放链路
```

正确链路：

```text
iPhone
  │
  ▼
HomeSphere
  │ 仅请求解析
  ▼
Media Bridge
  │ 3xx
  ▼
HomeSphere 返回 302
  │
  ▼
iPhone ─────────────► 115 CDN
```

至少实测：

- Safari / PWA 登录；
- 电影正常起播；
- 拖动进度；
- 暂停后继续；
- 连续播放不同文件；
- 剧集切换至少两集。

### 最重要的带宽判断

播放电影时，如果 VPS 的 10Mbps 长时间被持续占满，说明播放路径配置错误，通常是误开了代理 / relay。

正确情况下，VPS 只承担很小的网页、API 和 302 控制流量。

## 9. 风控保护

HomeSphere 对 Bridge 额外执行：

- 解析请求全局串行；
- 默认最小间隔 1 秒；
- 相同 STRM + User-Agent 最终地址短缓存 60 秒；
- 429 / 5xx 后熔断 60 秒；
- 不做自动暴力重试；
- 最终 CDN 地址执行 SSRF / 公网地址检查。

这些策略是为了减少重复和异常请求，不是规避第三方平台规则，也不能保证账号绝不会被限制。

## 10. 1GB 内存建议

1GB RAM 可以运行当前方案，但首次处理较大片库时建议增加约 1GB swap，避免瞬时内存压力直接触发 OOM。

同时避免在这台 VPS 上运行：

- 转码；
- 大型数据库；
- 视频下载缓存；
- 不必要的媒体服务。

## 11. 数据备份

建议备份：

```text
bridge-config/
HomeSphere /data volume
.env
```

不需要备份：

```text
media/*.strm
```

STRM 可由 Bridge 重新生成。

不要把任何账号凭据上传到公开 Git 仓库。

## 12. 更新

HomeSphere 更新前：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.bridge.yml \
  pull
```

然后：

```bash
docker compose \
  -f docker-compose.yml \
  -f docker-compose.bridge.yml \
  up -d
```

Bridge 长期稳定运行后，建议记录实际镜像 RepoDigest，并固定 digest，避免 `latest` 标签未来变化：

```bash
docker image inspect qicfan/115strm:latest --format '{{json .RepoDigests}}'
```

## 13. 常见问题

### 片库是空的

依次检查：

1. Bridge 是否已经生成 STRM；
2. VPS 的 `media/` 是否有 `.strm`；
3. HomeSphere `/setup` 是否显示 STRM 可读；
4. 是否点击过“同步STRM”。

### 点击播放返回 Bridge 错误

先停止连续点击。检查：

- Bridge 是否仍正常；
- 是否出现 429 / 5xx；
- HomeSphere 是否处于熔断期；
- STRM 第一行是否仍指向正确 Bridge 地址。

### 视频播放很慢

先看 VPS 带宽。

如果 VPS 带宽接近 10Mbps，优先检查是否启用了视频代理 / relay；不要通过提高 VPS 带宽掩盖错误链路。
