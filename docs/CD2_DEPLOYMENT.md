# CloudDrive2 Deployment for HomeSphere

本页用于 **CloudDrive2 + 115open + HomeSphere** 的真实兼容性验证。验证通过前，HomeSphere 仍以现有 STRM/3xx Bridge 为生产默认。

## 网络边界

推荐只公开 HomeSphere：

```text
Internet
   │
   ▼
Reverse Proxy / HomeSphere :443
   │
   │ host-gateway
   ▼
CloudDrive2 :19798
   │
   ▼
115open
```

CloudDrive2 的 19798 不应进入公网反向代理，也不应在云安全组中向全网开放。

## 1. 按 CloudDrive2 官方 Docker 模式部署

官方镜像：

```text
cloudnas/clouddrive2
```

官方 Docker 示例使用：

- `CLOUDDRIVE_HOME=/Config`
- `/Config` 持久化
- `/CloudNAS:shared`
- `/dev/fuse`
- `privileged: true`
- `pid: host`
- `network_mode: host`

示例：

```yaml
services:
  clouddrive2:
    image: cloudnas/clouddrive2
    container_name: clouddrive2
    restart: unless-stopped
    network_mode: host
    pid: host
    privileged: true
    environment:
      TZ: Asia/Shanghai
      CLOUDDRIVE_HOME: /Config
    devices:
      - /dev/fuse:/dev/fuse
    volumes:
      - /opt/clouddrive2/config:/Config
      - /mnt/clouddrive:/CloudNAS:shared
```

> 官方示例包含 FUSE/privileged，因为 CloudDrive2 Core 同时提供本地挂载。HomeSphere 当前只需要 API 探针，但在官方明确给出“纯 API 最小权限容器”前，本项目不自行删减这些 Docker 权限。

启动后管理页：

```text
http://服务器IP:19798
```

配置完成后，用宿主机防火墙限制 19798，只允许本机或可信管理 LAN。

## 2. 添加 115open

在 CloudDrive2：

```text
云存储 → 添加云存储 → 115open
```

不要选择已退役的旧 `115` 私有接口。按页面提示完成扫码/OAuth授权。

建议：

- 同一个115账号只保留这一台服务器侧 CloudDrive2 作为主要入口；
- 保持 CloudDrive2 默认并发与限流；
- 不为了同步速度调高并发；
- HomeSphere 不设置 `HOMESPHERE_115_COOKIE`。

## 3. 创建最小权限 API Token

进入：

```text
API令牌 → 创建令牌
```

当前直链探针建议：

- Root Directory：限制到影视目录；
- 只开启文件读取所需权限；
- 关闭写入、创建、移动、删除、离线下载、账号管理、Token 管理等权限；
- 设置合理有效期。

后续如果验证 CD2 目录索引，再单独增加 List 权限。

不要给 HomeSphere：

- CloudDrive2 主账号密码；
- 全根目录管理员 Token；
- 与别的工具共用的长期高权限 Token。

## 4. HomeSphere 配置

HomeSphere compose 已加入：

```yaml
extra_hosts:
  - "host.docker.internal:host-gateway"
```

因此同机访问官方 host-network CD2：

```env
HOMESPHERE_CD2_ENDPOINT=http://host.docker.internal:19798
HOMESPHERE_CD2_TOKEN=你的限目录只读Token
HOMESPHERE_CD2_PROBE_PATH=/CD2中显示的完整测试文件路径.mp4
HOMESPHERE_CD2_TIMEOUT_MS=8000
```

测试文件第一次建议选 iPhone Safari 原生支持的 MP4/H.264，避免把“编码不支持”误判成“CD2直链失败”。

更新 HomeSphere：

```bash
docker compose up -d --build
```

## 5. 运行探针

登录 HomeSphere：

```text
/library/cd2
```

先看元数据。

只有同时满足：

```text
返回 directUrl         是
最终 URL 为公网        是
额外 Header            无
UA 与当前浏览器一致     是
浏览器302候选           是
```

才进行 iPhone/Safari 的“打开测试直链”。

HomeSphere 不会在页面或 JSON 中回显：

- CD2 Token；
- 完整临时 directUrl；
- 签名 query；
- Header 值。

## 6. iPhone 验收

至少验证：

1. Safari 能开始请求/播放；
2. 再次打开仍正常；
3. seek / Range 没有明显异常；
4. HomeSphere VPS 流量不会按影片码率持续增长；
5. CloudDrive2 没有承担整段视频字节转发；
6. 115 没有异常高频请求或临时限制。

如果失败，不增加暴力重试，不切账号/IP规避限制。继续保留现有：

```text
STRM + 内网3xx Media Bridge
```

## 7. 为什么暂时不把 CD2 合进 HomeSphere 主 compose

CloudDrive2 官方推荐 Docker 使用 host network、FUSE、privileged 和 shared mount。把它强行改成普通 Docker bridge service 会偏离官方部署模型，也可能制造 FUSE mount propagation 和 NAS 兼容问题。

因此当前保持：

```text
CloudDrive2：按官方方式独立运行
HomeSphere：通过 host-gateway 只做最小 API 验证
```

真实115open与iPhone测试通过后，再决定是否提供平台特定的一键组合模板。
