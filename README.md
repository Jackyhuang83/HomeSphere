# HomeSphere

HomeSphere 是一个私人家庭影视门户，面向本人、家人和少量朋友使用。

当前目标环境很明确：

- 1 个 115 会员账号 / 约 50TB 媒体；
- 1 台 1C1G / 50GB / 10Mbps VPS；
- iPhone / iPad 为主要播放终端；
- 不使用 Emby / Jellyfin / Plex；
- 不在 VPS 上转码，也不让视频字节经过 VPS。

## 架构

```text
115
 │
 ▼
Media Bridge
 ├─ 持有115授权
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

- 115 凭据只保存在 Media Bridge；
- HomeSphere 不保存 115 Cookie、Token 或账号信息；
- HomeSphere 不实现 Cloud Provider；
- STRM 目录只读挂载给 HomeSphere；
- 播放时才解析临时直链；
- Bridge 必须返回 3xx；
- HomeSphere 不代理视频内容；
- Bridge 管理端口不公开到互联网；
- 115 调用采用保守限速、缓存和熔断策略。

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
- IPTV：M3U / EPG / 搜索 / 收藏 / 测活
- 首次使用检查页 `/setup`

## 快速开始

完整部署步骤见：

**[部署指南](docs/DEPLOYMENT.md)**

最简启动方式：

```bash
cp .env.example .env
mkdir -p bridge-config media

docker compose \
  -f docker-compose.yml \
  -f docker-compose.bridge.yml \
  up -d
```

HomeSphere 默认访问：

```text
http://服务器IP:8080
```

生产环境建议使用 HTTPS 反向代理，只公开 HomeSphere。

## 文档

| 文档 | 用途 |
|---|---|
| [部署指南](docs/DEPLOYMENT.md) | 从空 VPS 到115授权、STRM同步、iPhone播放 |
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
