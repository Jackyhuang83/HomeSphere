# HomeSphere

HomeSphere 是一个私人家庭影视门户，基于 LibreTV 精简改造。

当前仓库先完成“瘦身基线”，只保留：

- 家庭密码访问
- 豆瓣 / Bangumi / 影视热榜
- IPTV：M3U、EPG、频道搜索、收藏、测活
- PWA / iPhone / iPad / 桌面 WebUI

已经从代码中移除：

- Apple CMS 公网点播
- 多源聚合搜索
- 点播换源和测速
- TVBOX / SourceList 导入发布
- 旧 VOD 播放页、观看历史与搜索历史
- 点播源健康度与自动停用逻辑

后续路线：

1. 115 Provider + 本地 SQLite 索引
2. TMDB 自动整理与人工纠错
3. 私人海报墙
4. 115 HTTP 302 直连播放
5. 推荐榜单“搜我的115”
6. 夸克 Provider 预留

## 运行

```bash
npm ci
PASSWORD=your-password npm run dev
```

生产环境建议通过 HTTPS 部署。

## 环境变量

- `PASSWORD`：必填，家庭访问密码
- `PROXY_SECRET`：可选，会话签名密钥
- `DEFAULT_LIVE_SOURCES`：可选，预置 M3U/EPG 直播源
- `LIVE_ALLOW_PRIVATE`：可选，自建内网 IPTV 时设为 `1`
- `60S_API_BASE`：可选，影视热榜 API 地址

## 上游与许可证

- LibreTV: https://github.com/LibreSpark/LibreTV
- License: AGPL-3.0-or-later

HomeSphere 继续遵循上游 AGPL 许可证要求。
