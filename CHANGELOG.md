# Changelog

## v0.1.1 — 2026-10-02

HomeSphere 首个稳定版本，面向私人家庭 115 STRM 影视门户场景。

### 主要功能

- 私人家庭密码登录，30 天 HttpOnly Session。
- HomeSphere 与 Media Bridge 默认仅监听本机，通过 Cloudflare Tunnel 提供公网 HTTPS。
- 115 授权由 QMediaSync / Media Bridge 管理；HomeSphere 只消费 STRM，不直接接入 115 API。
- iPhone / iPad 原生 HLS 播放；Windows Chrome / Edge 通过本机 Player Helper 播放。
- 视频字节不经过 HomeSphere VPS，播放端直连 115 CDN。
- 电影 / 剧集作品级片库，TMDB 自动匹配、海报、简介、年份、地区与人工纠错。
- 继续播放、最近观看、已看状态、自动下一集、收藏、想看清单和高级筛选。
- 片库隐藏 / 恢复、作品信息编辑、季集修正、失效 STRM 清理。
- IPTV 多源聚合、频道分类、搜索、收藏、测活与 Direct-only 播放。
- ASSRT 中文字幕中心：字幕搜索、安装、SRT / ASS / SSA / VTT 转 WebVTT、本地缓存。
- 字幕同步校准：“字幕早了 / 字幕晚了”每次 0.5 秒，按当前媒体条目保存偏移。
- 一键 VPS 迁移备份 / 恢复，包括 HomeSphere 数据、QMediaSync PostgreSQL、STRM、配置与 Cloudflare Tunnel。
- 纯 SSH 安装、更新、密码管理和统一 `homesphere` 管理菜单。

### 稳定性修正

- 修复 TMDB 海报尺寸与失败缓存导致的海报缺失问题。
- 修复更新脚本语法检查缺口，并强化 CI 对全部 shell 脚本的逐文件校验。
- 修复 ASSRT 搜索在 Safari / Cloudflare 链路上的异常响应与超时问题。
- ASSRT 主 API 请求受总时限约束，并保留备用 API 路径。
- QMediaSync 固定在已验证版本，避免自动跟随上游变化影响家庭播放链路。

### 镜像

稳定镜像：

```text
ghcr.io/jackyhuang83/homesphere:0.1.1
```

开发 / 当前主线镜像仍使用：

```text
ghcr.io/jackyhuang83/homesphere:edge
```

### 升级

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/update.sh)
```

升级前建议保留现有迁移备份。HomeSphere 不会修改 115 原始媒体文件。
