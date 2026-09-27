# 115 Bridge：保守部署档

HomeSphere 的默认 115 Bridge 选用 **qicfan/115strm** 的旧版轻量镜像，而不是 QMediaSync 新版。

原因：

- 基于 115 开放平台接口；
- 自带 STRM 生成；
- 自带直链解析；
- 自带全局限速；
- 115 返回请求上限时会暂停；
- 同一 pickcode + User-Agent 的直链有缓存；
- 作者文档记录内存通常不超过 500MB；
- 比需要 PostgreSQL 的 QMediaSync 更适合 1C1G VPS。

> 这套策略只能降低异常调用和风控风险，不能承诺账号绝不会被限制。

## VPS 目标

适配当前部署条件：

```text
1 vCPU
1 GB RAM
50 GB SSD
10 Mbps
115 会员 / 50 TB
```

VPS 只承担控制流量：

```text
网页 / API / STRM / 302
```

电影数据必须：

```text
iPhone / iPad → 115 CDN
```

严禁通过 VPS 转码或中继视频。

## 启动

与 HomeSphere 一起启动：

```bash
mkdir -p bridge-config media
docker compose -f docker-compose.yml -f docker-compose.bridge.yml up -d
```

Bridge 管理口默认只绑定：

```text
127.0.0.1:12333
```

从自己的电脑临时打开 SSH 隧道：

```bash
ssh -L 12333:127.0.0.1:12333 root@你的VPS_IP
```

然后浏览器打开：

```text
http://127.0.0.1:12333
```

不要把 12333 直接开放公网。

## 首次设置

Bridge 当前文档默认账号为 `admin / admin123`。首次登录后立即修改管理密码。

115 只在 Bridge 内授权；HomeSphere 不保存115凭据。

推荐仅添加真正存影视的目录，例如：

```text
/电影
/电视剧
```

不要同步 115 根目录。

## 保守策略

### 同步

首次：

- 手动做一次全量同步；
- 不要同时启动多个全量任务。

后续：

- 推荐每 **6 小时**同步一次；
- 有新增内容时可以手动同步；
- 不建议 30 分钟高频长期轮询。

### 只读

HomeSphere 场景只需要：

- 读取目录；
- 生成 / 更新本地 STRM；
- 播放时解析直链。

不要启用：

- 上传元数据到115；
- 自动移动/重命名115文件；
- 自动删除115内容；
- Telegram 自动化；
- 与 HomeSphere 无关的上传/下载任务。

### 播放

Bridge 的“本地下载链接代理/中继”关闭。

原因：

```text
开启中继 → 视频经过 VPS → 10Mbps 成为瓶颈
关闭中继 → 302 → iPhone 直连115 CDN
```

HomeSphere 自己还会做第二层保护：

- Bridge 请求全局串行；
- 默认最小间隔 1 秒；
- 相同 STRM + User-Agent 最终 URL 短缓存 60 秒；
- 429 / 5xx 后熔断 60 秒；
- 不做自动暴力重试；
- 最终 URL 做公网/SSRF 检查。

### 资源保护

1C1G 建议额外配置 1GB swap，避免首次大库同步时因为瞬时内存峰值直接 OOM。

50GB 磁盘只保存：

- STRM；
- Bridge 配置/数据库；
- HomeSphere SQLite；
- 海报/小缓存；
- 日志。

不保存原始视频。

## 镜像版本

当前部署模板使用：

```text
qicfan/115strm:latest
```

这是已经迁移到 QMediaSync 前的旧轻量项目；Docker Hub 当前镜像已长期稳定未更新。第一次验证通过后，建议记录本机拉取到的 RepoDigest，并在长期生产部署里改成 digest 固定版本，避免未来标签变化。

查看：

```bash
docker image inspect qicfan/115strm:latest --format '{{json .RepoDigests}}'
```

## 验收

完成 Bridge 设置后：

1. 打开 HomeSphere → **检查**；
2. 确认 STRM 目录和 Bridge 都通过；
3. 片库 → **同步STRM**；
4. 点击 **测试播放链路**；
5. iPhone 实际播放一部电影；
6. 确认 VPS 带宽没有随视频码率持续占满。

如果播放时 VPS 的 10Mbps 长时间接近满载，说明误开了中继/代理，应立即停止并排查。
