# HomeSphere

HomeSphere 是一个私人家庭影视门户，面向本人、家人和少量朋友使用。

当前目标环境：

- 1 个 115 会员账号 / 约 50TB 媒体；
- 1 台 1C1G / 10GB / 10Mbps VPS；
- iPhone / iPad 为主要播放终端，也支持 Windows Chrome / Edge；
- 不使用 Emby / Jellyfin / Plex；
- 不在 VPS 上转码，也不让视频字节经过 VPS。

## 架构

```text
115
 │
 ▼
Media Bridge（QMediaSync）
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
 ├──────────────► iPhone / iPad
 │
 └──────────────► Windows Chrome / Edge
                         │
                         ▼
             HomeSphere Player Helper
                127.0.0.1:17865
                         │
                         ▼
                      115 CDN

播放数据：
iPhone / iPad ─────────────────────► 115 CDN
Windows ─► 本机 Player Helper ─────► 115 CDN
```

HomeSphere **只消费 STRM**，不直接接入任何网盘 API。

## 核心原则

- 115 授权由 Media Bridge（QMediaSync） 负责；
- HomeSphere 只消费 STRM，不直接接入网盘 API；
- STRM 目录只读挂载给 HomeSphere；
- 播放时才解析临时直链；
- HomeSphere 不代理视频内容；
- HomeSphere 与 Bridge 默认只监听 VPS 本机；
- Windows Player Helper 只监听本机 `127.0.0.1:17865`，不对局域网或公网开放；
- 对外访问统一通过 HTTPS；
- 对上游调用采用保守限速、缓存和熔断策略。

这些措施用于降低异常调用和账号风控风险，但不能保证第三方平台账号绝不会受到限制。

## 当前功能

- 家庭密码登录与 30 天 HttpOnly Session
- iPhone / iPad / 桌面响应式 WebUI
- Windows Chrome / Edge 通过本机 Player Helper 播放 115 STRM
- 跨设备继续播放：播放进度保存在 HomeSphere SQLite，并在“我的片库”折叠区统一展示
- 最近观看与已看状态：电影/剧集可恢复进度，剧集显示已看集数状态
- 我的收藏：在作品详情页收藏，并在“我的片库”折叠区快速进入
- STRM 只读扫描
- SQLite 本地片库索引
- 电影 / 剧集作品级归组
- 失效 STRM 清理
- TMDB 自动匹配、海报、简介与人工纠错
- Bridge allowlist、SSRF 防护、限速、短缓存和熔断
- 播放链路探测
- 豆瓣 / Bangumi / 影视热榜
- 直播：精简官方新闻入口 + 中文 M3U 四源聚合 / 自动切线路 + 自定义 M3U / EPG / 搜索 / 收藏 / 测活
- 直播频道智能分类：CCTV / 卫视 / 香港 / 台湾 / 地方 / 亚洲 / 欧洲 / 美洲 / 非洲 / 其他
- 直播 Direct-only：视频由客户端直连源站，HomeSphere 不提供直播视频代理
- 首次使用检查页 `/setup`

## 快速开始

完整部署步骤见：

**[部署指南](docs/DEPLOYMENT.md)**

第一次安装只需要 SSH 中执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/install.sh)
```

脚本会自动安装 Docker、创建目录、生成配置、拉取预构建镜像并启动 HomeSphere 与 Media Bridge（QMediaSync）。

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
HomeSphere                    127.0.0.1:8080
Media Bridge（QMediaSync）     127.0.0.1:12333
```

两者都不会直接裸露公网。

## Windows 播放助手

在 **Windows 的 Chrome / Edge** 中播放 115 STRM 时，需要在 Windows 电脑上安装一次 **HomeSphere Player Helper**。

它只在本机监听：

```text
127.0.0.1:17865
```

视频数据路径为：

```text
Windows 浏览器 -> 本机 Player Helper -> 115 CDN
```

视频字节不会经过 HomeSphere VPS，Helper 也不会保存 115 Token。

### 安装 / 更新

打开 **Windows PowerShell**，执行：

```powershell
irm https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/install-windows-helper.ps1 | iex
```

脚本会自动：

- 下载最新 Player Helper；
- 校验 SHA256；
- 停止旧版本并覆盖更新；
- 启动 Helper；
- 配置当前 Windows 用户登录后自动启动；
- 检查本机服务是否正常。

以后需要更新 Helper 时，重新执行同一条命令即可。

### 检查是否运行正常

在浏览器打开：

```text
http://127.0.0.1:17865/health
```

正常时会返回类似：

```json
{
  "ok": true,
  "name": "HomeSphere Player Helper",
  "version": "..."
}
```

如果 `ok` 为 `true`，回到 HomeSphere 页面刷新后即可播放。

> Windows 上如果只观看 IPTV 直播，不依赖 115 STRM 播放链路时，不要求安装 Player Helper。

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
