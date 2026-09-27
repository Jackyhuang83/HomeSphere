# HomeSphere 部署指南（纯 SSH 操作版）

这份指南按当前实际环境编写：

```text
VPS：1 vCPU / 1 GB RAM / 10 GB SSD / 10 Mbps
115：1 个会员账号 / 约 50 TB 媒体
终端：iPhone / iPad 为主
```

目标是：**不要求你编辑配置文件、不要求你找目录上传文件、不要求你懂 Docker Compose。**

服务器部署只需要在 SSH 中复制命令并按提示操作。

> 说明：115 授权和 Media Bridge 的首次设置是上游程序提供的网页界面，因此这一步需要打开浏览器；但仍然不需要你编辑任何服务器文件。

---

## 1. 最终架构

```text
115
 │
 ▼
Media Bridge
 ├─ 持有 115 授权
 ├─ 生成 STRM
 └─ 播放时返回 3xx
 │
 ▼
HomeSphere
 ├─ SQLite
 ├─ TMDB
 ├─ 海报墙
 └─ IPTV
 │
 ▼
iPhone / iPad

真正视频流：
iPhone / iPad ─────────────► 115 CDN
```

VPS 只做网页、索引、播放解析和 302 跳转。

**视频内容不经过 VPS。**

---

## 2. 第一次安装：只执行这一条命令

先 SSH 登录 VPS。

如果当前不是 root，先执行：

```bash
sudo -i
```

然后执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/install.sh)
```

安装脚本会自动完成：

- 安装 Docker；
- 安装基础工具；
- 检查并创建约 1GB swap；
- 下载 HomeSphere；
- 创建所有目录；
- 自动生成 HomeSphere 配置；
- 拉取 Media Bridge；
- 构建并启动 HomeSphere；
- 清理 Docker 构建缓存。

你不需要执行：

```text
nano
vim
vi
cp .env.example .env
上传 .env
手动创建 docker-compose.yml
手动找目录
```

### 家庭访问密码：默认自动生成

第一次安装时，脚本会自动生成一个 **20 位随机家庭密码** 并显示在 SSH 界面。

格式类似：

```text
8f34c79a21d50e6b94aa
```

这只是示例，每次安装实际生成的密码都不同。

你可以：

- 直接回车，使用系统生成的随机密码；
- 或者在 SSH 中输入自己的密码。

安装完成时，脚本还会再次显示当前家庭访问密码。

随后脚本会询问：

```text
TMDB API Read Access Token
```

如果现在没有，**直接回车即可**。

HomeSphere 仍然可以运行，只是暂时不会自动补齐 TMDB 海报和简介。

---

## 3. 安装完成后的安全状态

默认情况下：

```text
HomeSphere     127.0.0.1:8080
Media Bridge   127.0.0.1:12333
```

两个端口都只监听 VPS 本机。

也就是说，安装刚完成时它们**不会直接暴露在公网**。

这是故意这样设计的。

---

## 4. 第一次进入 HomeSphere 和 Media Bridge

在你自己的电脑终端执行：

```bash
ssh -L 8080:127.0.0.1:8080 -L 12333:127.0.0.1:12333 root@你的VPS_IP
```

这一条仍然只是 SSH，不需要编辑文件。

保持这个 SSH 窗口不要关闭。

然后浏览器打开：

HomeSphere：

```text
http://127.0.0.1:8080
```

Media Bridge：

```text
http://127.0.0.1:12333
```

---

## 5. 第一次设置 Media Bridge

当前 HomeSphere 使用：

```text
qicfan/115strm
```

默认管理账号通常为：

```text
用户名：admin
密码：admin123
```

第一次登录以后：

1. **立即修改默认管理密码**；
2. 完成 115 开放平台授权；
3. 只添加真正存放电影/电视剧的 115 目录；
4. STRM 本地输出目录使用：

```text
/media
```

例如 115 中真正的影视目录可能是：

```text
/电影
/电视剧
```

不要直接扫描整个 115 根目录。

### 推荐同步策略

第一次：

```text
手动全量同步 1 次
```

日常：

```text
每 6 小时同步 1 次
```

不要设置成高频同步。

### 不需要开启的功能

HomeSphere 只需要 Media Bridge：

- 读取 115；
- 生成 STRM；
- 播放时解析临时直链；
- 返回 3xx。

因此以下功能保持关闭：

- 视频代理 / relay / 中继；
- 自动上传元数据到 115；
- 自动移动 115 文件；
- 自动重命名 115 文件；
- 自动删除 115 文件；
- 与 HomeSphere 无关的下载或转存任务。

---

## 6. HomeSphere 建立片库

Media Bridge 已经生成 STRM 后，浏览器打开：

```text
http://127.0.0.1:8080/setup
```

登录以后按页面检查。

然后进入：

```text
片库 → 同步 STRM
```

HomeSphere 会自动把 STRM 建立成本地 SQLite 片库。

普通浏览、搜索、海报墙展示不会反复访问 115。

---

## 7. 测试播放

点击一部影片播放。

正确的数据路径应该是：

```text
iPhone / iPad
    │
    ▼
HomeSphere
    │
    ▼
Media Bridge
    │
    └─ 返回 3xx
          │
          ▼
HomeSphere 返回 302
          │
          ▼
iPhone / iPad ─────────► 115 CDN
```

建议测试：

- 电影正常起播；
- 拖动进度条；
- 暂停再继续；
- 连续切换几个文件；
- 电视剧连续切换至少两集。

### 判断有没有错误走 VPS 流量

播放视频时，在 SSH 中执行：

```bash
docker stats --no-stream
```

正常情况下，HomeSphere 不应该持续承担大视频流量。

如果 VPS 的 10Mbps 长时间跑满，说明播放链路有问题，通常是误开了视频代理 / relay。

---

## 8. 准备给家人朋友使用：Cloudflare Tunnel HTTPS

HomeSphere 正式公网访问统一使用 **Cloudflare Tunnel**，和 MiniProbe 的安全访问思路一致。

不再使用 Caddy / Nginx 直接反代，也不需要把 80 / 443 暴露给公网。

最终链路：

```text
家人 / 朋友
    │
    ▼
Cloudflare HTTPS
    │
    ▼
Cloudflare Tunnel
    │
    ▼
127.0.0.1:8080
    │
    ▼
HomeSphere
```

### 第一步：Cloudflare 网页里创建 Tunnel

在 Cloudflare 控制台：

1. 创建 **Remotely-managed Tunnel**；
2. 添加一个 Public Hostname，例如：

```text
media.example.com
```

3. Service 填：

```text
http://127.0.0.1:8080
```

4. 复制 Tunnel Token，也就是以 `eyJ...` 开头的一长串字符。

这里不需要 Cloudflare API Key。

### 第二步：SSH 中执行一条命令

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/https.sh)
```

脚本会让你输入：

```text
HomeSphere 域名
Cloudflare Tunnel Token
```

然后自动完成：

- 安装 / 检查 `cloudflared`；
- 自动配置并启动 `cloudflared`；
- 自动设置开机恢复；
- 启动 Cloudflare Tunnel；
- 验证公网 HTTPS 是否可访问；
- 开启 HomeSphere Secure Cookie；
- 自动重启 HomeSphere；
- 如果之前装过旧版持久化 Token 文件或 Caddy，会自动清理。

配置完成后，**VPS 重启会自动恢复 Cloudflare Tunnel，不需要重新输入 Token。**

你仍然不需要编辑任何服务器文件。

### 第三步：访问

```text
https://你的域名
```

### 端口安全

使用 Cloudflare Tunnel 后，VPS **不需要开放**：

```text
TCP 80
TCP 443
TCP 8080
TCP 12333
```

HomeSphere 继续只监听：

```text
127.0.0.1:8080
```

Media Bridge 继续只监听：

```text
127.0.0.1:12333
```

cloudflared 是从 VPS 主动向 Cloudflare 建立出站连接，因此不会新增公网入站端口。

如果你的 VPS 对出站流量做了严格限制，Cloudflare Tunnel 需要能够连接 Cloudflare 的 7844 端口。

---

## 9. 忘记家庭密码怎么办

不需要找配置文件，也不需要重新安装 HomeSphere。

SSH 登录 VPS 后执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/password.sh)
```

会看到：

```text
HomeSphere 家庭密码管理

1. 查看当前密码
2. 重新生成 20 位随机密码
3. 设置自己的密码
0. 退出
```

选择 **1** 可以直接查看当前家庭密码。

选择 **2** 会：

- 自动生成新的 20 位随机密码；
- 写入 HomeSphere 配置；
- 自动重启 HomeSphere；
- 显示新密码；
- 让之前已经登录的设备全部退出登录。

选择 **3** 可以在 SSH 中设置自己的密码，不需要编辑文件。

因此密码忘记以后，只要还能 SSH 登录 VPS，就可以恢复访问。

> HomeSphere 家庭密码会保存在 VPS 本地的受限配置文件中，供服务启动和 SSH 密码管理使用。不要把密码管理命令的输出截图公开分享。

---

## 10. 以后更新：仍然只执行一条命令

SSH 登录 VPS 后执行：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/update.sh)
```

脚本会自动：

- 更新 HomeSphere；
- 更新 Media Bridge 镜像；
- 重新构建；
- 重启服务；
- 保留已有密码、115 授权、SQLite 数据和 STRM；
- 清理 Docker 构建缓存。

不需要找 HomeSphere 安装目录。

---

## 11. 查看运行状态

任何时候都可以在 SSH 中执行：

```bash
docker ps
```

正常情况下至少应该看到：

```text
homesphere
media-bridge
```

Cloudflare Tunnel 不运行在 Docker 中，所以 `docker ps` 不会显示它。

查看当前启动周期内的 Tunnel 状态：

```bash
systemctl status homesphere-cloudflared.service --no-pager
```

Tunnel 已配置为 systemd 开机自启，因此 VPS 重启后会自动恢复，不需要重新输入 Token。

---

## 12. 出问题时怎么做

### HomeSphere 打不开

SSH 中执行：

```bash
docker logs --tail 100 homesphere
```

把完整输出发给我。

### Media Bridge 有问题

执行：

```bash
docker logs --tail 100 media-bridge
```

把完整输出发给我。

### Cloudflare Tunnel / HTTPS 有问题

执行：

```bash
journalctl -u homesphere-cloudflared -n 100 --no-pager
```

把完整输出发给我。

### 看 VPS 磁盘

执行：

```bash
df -h
```

### 看 Docker 占用

执行：

```bash
docker system df
```

---

## 13. 这台 10GB VPS 不做什么

当前 VPS 只有：

```text
1C1G
10GB SSD
10Mbps
```

所以明确不做：

- 保存电影原文件；
- 视频转码；
- 视频中继；
- 视频下载缓存；
- Emby；
- Jellyfin；
- Plex；
- CloudDrive2；
- NAS 挂载。

VPS 中只保存：

- HomeSphere 程序；
- Docker 镜像；
- SQLite；
- Media Bridge 配置；
- 少量 STRM；
- 少量缓存。

安装脚本和更新脚本都会主动清理 Docker 构建缓存，尽量控制 10GB 磁盘占用。

---

## 14. 你真正需要记住的命令

第一次安装：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/install.sh)
```

配置 Cloudflare Tunnel HTTPS：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/https.sh)
```

查看 / 重置家庭密码：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/password.sh)
```

以后更新：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Jackyhuang83/HomeSphere/main/scripts/update.sh)
```

查看状态：

```bash
docker ps
```

排查 HomeSphere：

```bash
docker logs --tail 100 homesphere
```

排查 Media Bridge：

```bash
docker logs --tail 100 media-bridge
```

**不再要求手动编辑任何服务器配置文件。**
