# HomeSphere

HomeSphere 是一个私人家庭影视门户，面向本人、家人和少量朋友使用。

当前目标环境：

- 1 个 115 会员账号 / 约 50TB 媒体；
- 1 台 1C1G / 10GB / 10Mbps VPS；
- iPhone / iPad 为主要播放终端；
- 不使用 Emby / Jellyfin / Plex；
- 不在 VPS 上转码，也不让视频字节经过 VPS。

## 架构

```text
115
 │
 ▼
Media Bridge
 ├─ 管理 115 授权
 ├─ 生成 STRM
 └─ 播放时返回 3xx
 │
 ├──────────────► /media/*.strm
 │
 ▼
HomeSphere
 ├─ SQLite
 ├─ TMDB
 ├─ 海报墙 / 推荐
 └─ IPTV
 │
 ▼
iPhone / iPad

播放数据：
iPhone / iPad ─────────────► 115 CDN
```

HomeSphere **只消费 STRM**，不直接接入任何网盘 API。

## 核心原则

- 115 授权由 Media Bridge 负责；
- HomeSphere 只消费 STRM，不直接接入网盘 API；
- STRM 目录只读挂载给 HomeSphere；
- 播放时才解析临时直链；
- HomeSphere 不代理视频内容；
- HomeSphere 与 Bridge 默认只监听 VPS 本机；
- 对外访问统一通过 HTTPS；
- 对上游调用采用保守限速、缓存和熔断策略。

这些措施用于降低异常调用和账号风控风险，但不能保证第三方平台账号绝不会受到限制。

## 当前功能

- 家庭密码登录与 30 天 HttpOnly Session
- iPhone / iPad / 桌面响应式 WebUI
- STRM 只读扫描
- SQLite 本地片库索引
- 电影 / 剧集作品级归组
- 失效 STRM 清理
- TMDB 自动匹配、海报、简介与人工纠错
- Bridge allowlist、SSRF 防护、限速、短缓存和熔断
- 播放链路探测
- 豆瓣 / Bangumi / 影视热榜
- 直播：精简官方新闻入口 + 自定义 M3U / EPG / 搜索 / 收藏 / 测活
- 首次使用检查页 `/setup`

## 快速开始

完整部署步骤见：

**[部署指南](docs/DEPLOYMENT.md)**

第一次安装只需要 SSH 中执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/install.sh)
```

脚本会自动安装 Docker、创建目录、生成配置、拉取预构建镜像并启动 HomeSphere 与 Media Bridge。

不需要手动编辑 `.env`、Docker Compose 或上传配置文件。

首次安装会自动生成安全的家庭访问密码，也可以在 SSH 中改成自己的密码。

忘记密码时无需找配置文件，直接运行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/password.sh)
```

可以查看当前密码、重新生成随机密码或设置自定义密码。

以后 SSH 登录 VPS，直接运行：

```bash
homesphere
```

进入统一管理界面，可查看状态、更新、重启、管理家庭密码、Cloudflare Tunnel、日志和系统资源。

单独执行更新脚本仍然可用：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/update.sh)
```

配置公网 HTTPS（Cloudflare Tunnel）：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/https.sh)
```

公网访问统一通过 Cloudflare Tunnel：

```text
Cloudflare HTTPS -> Tunnel -> 127.0.0.1:8080 -> HomeSphere
```

Cloudflare Tunnel 由部署脚本自动配置，并支持 VPS 重启后自动恢复。

VPS 不需要开放 80 / 443 / 8080 / 12333。

默认情况下：

```text
HomeSphere     127.0.0.1:8080
Media Bridge   127.0.0.1:12333
```

两者都不会直接裸露公网。

## 文档

| 文档 | 用途 |
|---|---|
| [部署指南](docs/DEPLOYMENT.md) | 纯 SSH 部署、115授权、STRM同步、HTTPS、更新与排障 |
| [架构说明](docs/ARCHITECTURE.md) | STRM / Bridge 边界、播放链路、安全策略 |
| [第三方声明](THIRD_PARTY_NOTICES.md) | 上游项目与许可证 |

文档只保留当前有效方案，不记录已经放弃的历史架构。

## 开发验证

```bash
npm test
npm run typecheck
npm run build
```

## License

HomeSphere 基于 LibreTV 修改，继续遵循 **AGPL-3.0-or-later**。详见 `LICENSE` 和 `THIRD_PARTY_NOTICES.md`。

HomeSphere 不包含、托管或提供任何影视内容。
