# HomeSphere

HomeSphere 是一个私人家庭影视门户，面向本人、家人和少量朋友使用。

当前稳定版本：**v0.1.1**。稳定镜像为 `ghcr.io/jackyhuang83/homesphere:0.1.1`，同时发布 `latest` 标签；开发主线继续使用 `edge`。

当前目标环境：

- 1 个 115 会员账号 / 约 50TB 媒体；
- 1 台 2C2G / 30GB / 30Mbps VPS；
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
- 剧集连续观看：下一集按钮、播放结束自动下一集、季/集手动修正与编号缺口提示
- 我的收藏：在作品详情页收藏，并在“我的片库”折叠区快速进入
- 想看清单：与收藏分开管理，并支持片库筛选
- STRM 只读扫描
- 片库安全隐藏 / 恢复：只改变 HomeSphere 展示，不删除 115 文件或 STRM
- 片库人工编辑：片名、年份、电影/剧集类型可修正；可重新匹配 TMDB
- 高级筛选：收藏、想看、观看中、已看完、未观看可与类型/年份/地区/搜索组合
- SQLite 本地片库索引
- 电影 / 剧集作品级归组
- 失效 STRM 自动清理，并在手动同步结果中显示清理数量
- TMDB 自动匹配、海报、简介与人工纠错
- 海报加载优化：TMDB w500 海报、异步解码与更长的私有浏览器缓存
- Bridge allowlist、SSRF 防护、限速、短缓存和熔断
- 播放链路探测
- 豆瓣 / Bangumi / 影视热榜
- 直播：精简官方新闻入口 + 中文 M3U 四源聚合 / 自动切线路 + 自定义 M3U / EPG / 搜索 / 收藏 / 测活
- 直播频道智能分类：CCTV / 卫视 / 香港 / 台湾 / 地方 / 亚洲 / 欧洲 / 美洲 / 非洲 / 其他
- 直播 Direct-only：视频由客户端直连源站，HomeSphere 不提供直播视频代理
- 首次使用检查页 `/setup`
- 完整 VPS 迁移包：一键备份 / 恢复 HomeSphere、SQLite、QMediaSync PostgreSQL、STRM、配置与现有 Cloudflare Tunnel
- 字幕中心 v1：ASSRT 中文字幕搜索、SRT/ASS/SSA/VTT 转 WebVTT、本地缓存并随影片播放；字幕文本走 VPS，115 视频仍直连 CDN

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

## 115 网盘影视导入 / STRM 建库

这是 HomeSphere 日常使用频率最高的一组操作。先记住最重要的一点：

> **“把 115 影视导入 HomeSphere”不是把视频下载到 VPS。**
> QMediaSync 只读取 115 目录并在 VPS 生成很小的 `.strm` 文本文件；HomeSphere 再扫描这些 STRM 建立片库。真正播放时，视频终端直接连接 115 CDN。

完整链路：

```text
115 原始影视文件
   │
   ▼
QMediaSync 扫描 115
   │
   ├─ 生成 /media/.../*.strm
   │
   ▼
HomeSphere 扫描 STRM
   │
   ├─ 建立 SQLite 片库
   ├─ 电影 / 剧集归组
   └─ TMDB 补海报 / 简介 / 年份 / 地区
   │
   ▼
点击播放
   │
   ▼
QMediaSync 解析临时播放地址
   │
   ▼
播放终端 ─────────────────► 115 CDN
```

VPS 不保存电影或电视剧原文件，只保存 STRM、HomeSphere 本地索引、少量缓存和字幕文本。

### 最常用：以后往 115 新增影视后怎么做

如果同步目录已经建立好，以后日常只需要记住下面这条流程：

```text
把新电影 / 新剧集放进 115 已配置目录
              ↓
QMediaSync → 同步目录管理
              ↓
对对应目录执行「增量同步」
              ↓
QMediaSync → STRM同步记录
确认任务完成、生成了新的 STRM
              ↓
HomeSphere → 片库 → 同步 STRM
或 SSH：homesphere → 12 → 3
              ↓
新内容进入 HomeSphere 片库
```

例如已经建立：

```text
115：影视/国产电视剧2026
目标路径：/media
```

后来又往这个 115 目录新增了一部电视剧，就直接对 **“影视/国产电视剧2026”执行增量同步**，然后再同步 HomeSphere STRM 索引。正常情况下不需要重新全量扫描整个目录，更不需要重新扫描整个 115 网盘。

---

### 1. 第一次打开 QMediaSync

HomeSphere 安装完成后，Media Bridge（QMediaSync）默认只监听：

```text
127.0.0.1:12333
```

推荐从自己的电脑建立 SSH Tunnel：

```bash
ssh -L 12333:127.0.0.1:12333 root@你的VPS_IP
```

保持 SSH 窗口开启，然后浏览器访问：

```text
http://127.0.0.1:12333
```

如果已经单独为 QMediaSync 配置了 **Cloudflare Tunnel + Access**，也可以使用受 Access 保护的管理域名。不要把 VPS 的 12333 端口直接暴露到公网。

### 2. 第一次配置 115 账号

第一次进入 QMediaSync 后：

1. 完成 QMediaSync 管理员账号初始化；
2. 数据库使用 HomeSphere 已部署的 PostgreSQL；
3. 进入网盘账号管理；
4. 新增 **115** 账号；
5. 按页面提示完成 115 OAuth 授权。

HomeSphere 本身不保存 115 登录凭据；115 授权由 QMediaSync / Media Bridge 管理。

### 3. 先检查一次全局 STRM 设置

进入 QMediaSync 的 **STRM设置**，HomeSphere 推荐保持：

```text
STRM直连地址：http://media-bridge:12333
启用本地代理播放：关闭
是否下载元数据：否
网盘不存在的元数据：保留 / 不上传
```

HomeSphere 自己通过 TMDB 管理海报和简介，因此不需要 QMediaSync 下载或上传媒体元数据。

如果页面中还有接口并发、下载队列等设置，当前家庭使用建议保持保守值：

```text
下载队列每秒处理数量：1
网盘接口 QPS：3
115 文件列表每页：1150
```

不要开启视频 relay / 中继、联动删除网盘文件、自动移动 115 文件、自动重命名 115 文件或 Emby / Jellyfin / Plex 联动。

---

### 4. 第一次添加同步目录

进入：

```text
QMediaSync → 同步目录管理 → 添加同步目录
```

以实际目录 **“影视/国产电视剧2026”** 为例，按下面填写：

```text
同步源类型：115

网盘账号：
选择已经授权的 115 账号

来源路径：
影视/国产电视剧2026

目标路径：
/media

STRM存放目录：
/media/影视/国产电视剧2026
（由 QMediaSync 自动生成，不手动填写）

是否自定义设置：
关闭
```

这里最容易出错的是 **目标路径**。

目标路径只选择：

```text
/media
```

QMediaSync 会自动计算：

```text
目标路径 /media
      +
来源路径 影视/国产电视剧2026
      ↓
STRM存放目录 /media/影视/国产电视剧2026
```

不要把“目标路径”手动选择成：

```text
/media/影视/国产电视剧2026
```

否则来源路径还可能被再次拼接，造成重复目录。

电影和电视剧建议分开创建同步目录，例如：

```text
115 /影视/华语电影
→ 目标路径 /media
→ STRM /media/影视/华语电影

115 /影视/国产电视剧2026
→ 目标路径 /media
→ STRM /media/影视/国产电视剧2026
```

不要直接选择整个 115 根目录。媒体量较大时按电影、电视剧、年份或已有分类拆分，同步更容易维护，也能降低不必要的 115 API 调用。

---

### 5. 新建目录后的第一次同步：用“全量同步”

同步目录添加完成后，返回：

```text
QMediaSync → 同步目录管理
```

找到刚建立的目录，然后第一次执行：

```text
全量同步
```

第一次使用全量同步的原因是需要完整建立这个目录的文件缓存和 STRM。

**全量同步不是下载全部视频。** 它会遍历网盘目录、建立同步缓存并生成 STRM；视频本体仍然留在 115。

QMediaSync 中：

- **全量同步**：完整递归检查该同步目录，适合第一次建立、目录发生大量变化、删除/移动/重命名后需要重新核对；
- **增量同步**：只查询上次同步以后发生变化的文件，适合平时新增电影、电视剧和剧集；
- 增量同步无法可靠感知所有删除情况，因此发现目录删除、移动或重命名没有正确反映时，再执行一次全量同步。

---

### 6. 到“STRM同步记录”确认结果

执行同步以后，进入：

```text
QMediaSync → STRM同步记录
```

这里才是检查同步是否成功的主要页面。

桌面端一般可以直接看到：

```text
状态
总文件数
新增STRM数
下载元数据数
上传元数据数
失败原因
```

手机端如果没有直接显示全部字段，点该条记录的 **展开按钮** 或 **“查看”**。

展开后重点看：

```text
扫描的总文件数
生成strm数
需要下载的元数据数
需要上传的元数据数
```

例如：

```text
扫描的总文件数：17
生成strm数：17
需要下载的元数据数：0
需要上传的元数据数：0
```

这表示：

- 扫描到 17 个符合条件的视频文件；
- 成功生成 17 个 STRM；
- 没有下载元数据；
- 没有上传元数据；
- 对 HomeSphere 的配置来说，这是正常结果。

注意：**17 个 STRM 表示 17 个视频文件，不一定表示 17 部作品。**

例如一部电视剧有 17 集：

```text
17 个视频文件
→ 17 个 STRM
→ HomeSphere 识别为 1 部电视剧 + 17 集
```

如果任务显示失败，先看“失败原因”，不要反复连续点击全量同步。

---

### 7. 检查 VPS 上的 STRM

QMediaSync 显示同步成功后，SSH 登录 VPS：

```bash
homesphere
```

进入：

```text
12. 115 / STRM
2. 检查 STRM
```

这里会检查：

- 当前 STRM 总数；
- STRM 是否位于 HomeSphere 与 QMediaSync 的共享 `/media` 目录；
- 抽检的 STRM 是否指向正确的 Media Bridge 地址。

正常应看到类似：

```text
[通过] 抽检 ... 个 STRM
```

STRM 内容应使用：

```text
http://media-bridge:12333/...
```

也可以直接查看 VPS 上当前 STRM 总数：

```bash
find /opt/homesphere/media -type f -iname '*.strm' | wc -l
```

如果 QMediaSync 显示“生成strm数”正常，但这里完全找不到 STRM，优先检查同步目录的“目标路径”是不是正确选择了 `/media`。

---

### 8. 把新 STRM 加入 HomeSphere 片库

QMediaSync 生成 STRM 之后，还需要 HomeSphere 更新自己的 SQLite 片库索引。

SSH 中：

```bash
homesphere
```

选择：

```text
12. 115 / STRM
3. 立即同步 HomeSphere STRM 索引
```

或者直接在 HomeSphere WebUI 中：

```text
片库 → 同步 STRM
```

这一步会：

- 扫描 VPS 上已有的 `.strm`；
- 识别电影与电视剧；
- 把同一部剧的各集归到作品下面；
- 更新 HomeSphere SQLite；
- 清理已经不存在的 STRM 索引；
- 使用 TMDB 补充海报、年份、简介和地区信息。

它**不会扫描 115 网盘，也不会下载视频**。

完成后进入：

```text
HomeSphere → 我的片库
```

检查刚添加的电影或电视剧是否出现。

如果海报或 TMDB 匹配还没有立即完成，可以稍等片库元数据处理，或者使用 HomeSphere 已有的人工修正 / 重新匹配功能。

---

### 9. 日常新增内容：以后主要用“增量同步”

同步目录第一次建立完成后，平时最常用的是下面四步：

```text
1. 往 115 已配置目录添加影视文件
2. QMediaSync → 同步目录管理 → 增量同步
3. QMediaSync → STRM同步记录 → 确认新增 STRM
4. HomeSphere → 片库 → 同步 STRM
```

例如：

```text
115 /影视/国产电视剧2026
原来有：17 集
后来新增：第 18～20 集

QMediaSync 增量同步
        ↓
正常应新增约 3 个 STRM
        ↓
HomeSphere 同步 STRM
        ↓
原电视剧下面出现第 18～20 集
```

这种情况**不要每次都点全量同步**。

---

### 10. 什么时候应该再用“全量同步”

以下情况再执行全量同步比较合适：

- 第一次建立同步目录；
- 在 115 中批量移动了很多文件；
- 大量重命名目录或视频文件；
- 删除了一批影视文件，希望本地 STRM 与 115 重新完整核对；
- 增量同步明显漏掉了文件；
- 同步缓存异常，需要重新建立完整状态。

单纯新增几部电影、几集电视剧时，优先使用增量同步。

---

### 11. 自动同步与手动同步的区别

HomeSphere 安装后会启用：

```text
homesphere-strm-sync.timer
```

默认每 6 小时低频执行一次 **HomeSphere 本地 STRM 索引同步**。

这里一定要区分两层同步：

```text
QMediaSync 同步
= 扫描 115
= 生成 / 更新 STRM

HomeSphere STRM 索引同步
= 扫描 VPS 已有的 STRM
= 更新 HomeSphere 片库
```

所以：

> **HomeSphere 的定时器不会主动扫描 115。**

如果 115 新增了文件，但 QMediaSync 还没有执行同步，那么 HomeSphere 的定时器也看不到这些新内容。

如果希望完全自动化，可以在 QMediaSync 对稳定目录启用低频定时同步，例如每 6 小时一次；不建议设置过高频率。

---

### 12. 删除、移动、重命名内容时要注意

如果只是新增文件：

```text
增量同步 → HomeSphere STRM 同步
```

如果在 115 中发生：

```text
删除
移动
大规模重命名
目录结构调整
```

建议执行：

```text
QMediaSync 全量同步
        ↓
HomeSphere STRM 索引同步
```

这样更容易让本地 STRM 和 HomeSphere 片库与 115 当前状态重新对齐。

HomeSphere 的片库删除 / 隐藏功能不会主动删除 115 原始文件；QMediaSync 的“联动删除网盘文件”也应保持关闭。

---

### 13. 最后验证播放链路

新内容进入 HomeSphere 后，随机播放一部电影或一集电视剧。

正确链路：

```text
HomeSphere 页面 / API
        ↓
QMediaSync / Media Bridge
        ↓ 302 / 临时直链
播放终端
        ↓
115 CDN
```

视频播放时可以在 VPS 执行：

```bash
docker stats --no-stream
```

正常情况下 VPS 不应该持续承担与视频码率相当的大流量。

HomeSphere 的原则始终是：

```text
网页、索引、控制、字幕文本 → VPS
视频字节               → 播放终端直连 115 CDN
```

---

### 14. 最常见问题快速判断

| 现象 | 先检查什么 |
|---|---|
| QMediaSync 扫描到了文件，但生成 STRM 为 0 | 视频扩展名、最小文件大小、排除规则 |
| QMediaSync 显示生成 STRM 成功，但 HomeSphere 看不到 | 先执行 `homesphere → 12 → 2`，再执行 `12 → 3` |
| VPS 上完全没有新 STRM | 同步目录“目标路径”是否选为 `/media` |
| 新增文件没出现 | 对对应同步目录先执行“增量同步” |
| 删除/移动/重命名后结果不一致 | 对该同步目录执行一次“全量同步”，再同步 HomeSphere STRM |
| STRM 有了但作品被识别错误 | 在 HomeSphere 使用人工编辑 / TMDB 重新匹配 |
| 电视剧多集被拆成多个作品 | 先检查文件名中的剧名和季集号，再使用 HomeSphere 季/集修正 |
| 播放时 VPS 流量明显跑满 | 检查是否误开 QMediaSync 本地代理 / relay；HomeSphere 正常应 302 到 115 CDN |

## 夸克网盘支持现状

HomeSphere 当前稳定版 **v0.1.1 默认不直接接入夸克网盘**。

原因不是 HomeSphere 片库层不能识别 STRM，而是当前冻结使用的 QMediaSync v0.14.23 **没有原生夸克驱动**。它当前的网盘/数据源代码主要包括 115、百度网盘、OpenList 和本地目录，因此夸克不能像 115 那样直接在 QMediaSync 里完成授权后生成 STRM。

可选路径是：

```text
夸克
  ↓
OpenList
  ↓
QMediaSync 的 OpenList 数据源
  ↓
生成 STRM
  ↓
HomeSphere
```

但这里有一个关键限制：OpenList 的普通“夸克网盘”驱动目前需要使用 **本地代理**，也就是视频数据会经过 OpenList 所在服务器中转。这与 HomeSphere 的核心原则“视频字节不经过 VPS”冲突，因此 **HomeSphere 不把普通夸克驱动作为默认方案**。

OpenList 另外提供 **QuarkTV / 夸克 TV** 驱动，官方说明该驱动支持 302，但只支持访问和下载等有限操作。理论上它更符合 HomeSphere 的直链播放架构，但当前 HomeSphere 尚未把 OpenList + QuarkTV 纳入默认安装，也尚未完成实际播放链路验证，因此暂时标记为 **实验性 / 第二阶段**。

当前建议：

- 115：正式支持，使用 QMediaSync 原生 115 OAuth + STRM；
- 夸克普通驱动：不建议接入 HomeSphere，避免把视频流量中继到 VPS；
- 夸克 TV：可作为后续实验方案，前提是实际验证始终保持 302 / 客户端直连，不让视频字节经过 HomeSphere VPS；
- 在验证完成前，不要为了夸克额外开放公网端口，也不要把 Cookie、Token 或 Refresh Token 写入仓库。

如果后续启用夸克，目标架构仍然必须保持：

```text
HomeSphere / QMediaSync / OpenList
        │
        └─ 只负责控制、索引和直链解析
                         │
                         ▼
播放终端 ─────────────► 夸克 CDN
```

而不是：

```text
播放终端 → HomeSphere VPS / OpenList VPS → 夸克
```

---

## 字幕中心

HomeSphere 可以为电影和剧集挂载外挂中文字幕。第一阶段使用 **ASSRT（伪射手）** 作为字幕源。

### ASSRT 网站与 API Token

推荐优先使用 ASSRT 镜像站：

- [ASSRT 镜像站：2.assrt.net](https://2.assrt.net/)
- [ASSRT 主站：assrt.net](https://assrt.net/)
- [ASSRT API 文档](https://2.assrt.net/api/doc)

如果主站出现 TLS / SSL 错误，可以先改用 `2.assrt.net`；如果浏览器仍报错，再尝试关闭代理/VPN或切换 Wi‑Fi / 蜂窝网络。

第一次使用需要准备 ASSRT API Token：

1. 打开 `https://2.assrt.net/`；
2. 登录已有账号；没有账号时，从页面中的“加入我们 / 登录”入口完成注册；
3. 登录后进入用户面板；
4. 找到自己的 **API Token** 并复制；
5. Token 属于私密凭据，不要贴到聊天、README、GitHub Issue 或其他公开位置。

### 在 HomeSphere 中配置

SSH 登录 VPS 后运行：

```bash
homesphere
```

进入：

```text
14. 字幕中心
1. 配置 / 更换 ASSRT API Token
```

粘贴 Token 后，HomeSphere 会先验证 Token；验证成功后自动重启 HomeSphere。

Token 只保存在 VPS 本地 `.env`，不会写入仓库。

### 搜索并使用中文字幕

配置完成后：

1. 打开一部电影或剧集详情页；
2. 剧集先选择要播放的具体集数；
3. 在播放器下方找到“中文字幕”区域；
4. 点击“搜索字幕”；
5. 优先选择与当前视频文件名、季集号以及 `WEB-DL / BluRay / NF / AMZN` 等版本信息最接近的结果；
6. 点击“使用”；
7. 开始播放，确认字幕内容和时间轴是否正常；
8. 如果字幕整体提前或延后，使用“字幕早了 / 字幕晚了”按钮，每次自动校准 0.5 秒；偏移会按当前影片/剧集保存；
9. 如果越播放偏差越大，通常是片源版本不匹配，建议“重新搜索”并更换字幕，而不是继续累计偏移；
10. 不需要当前字幕时可以“移除”，同步偏移也会随新字幕重新归零。

HomeSphere 会把 SRT / ASS / SSA / VTT 转换为浏览器可播放的 WebVTT，并保存在 HomeSphere `/data`。这些字幕会跟随完整迁移包一起备份；不会修改 115 原视频或 STRM。

字幕只是一小段文本数据，会经过 HomeSphere；**115 视频字节仍然由播放终端直连 CDN，不经过 VPS**。

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
| [更新日志](CHANGELOG.md) | 稳定版本发布说明与主要变更 |

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
