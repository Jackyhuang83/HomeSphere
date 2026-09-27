# CloudDrive2 Compatibility Probe

HomeSphere 不直接把 CloudDrive2 声明为生产 Bridge，而是先验证它在 **115open + 普通 Web 浏览器** 场景下是否能满足“最终 CDN 302、不代理视频字节”。

## 为什么需要探针

CloudDrive2 官方 gRPC 的 `GetDownloadUrlPath` 可以返回：

- `directUrl`
- `expiresIn`
- `userAgent`
- `additionalHeaders`
- `downloadUrlPath`

这对原生客户端很完整，但浏览器通过302跳转时不能由 HomeSphere 任意追加 `Referer`、Cookie 或自定义 Header，也不能伪造任意 User-Agent。

所以必须用真实115open账号和真实 iPhone/Safari 验证，而不是只看 API 字段。

## 最小权限原则

在 CloudDrive2 创建**单独的 API Token**：

- Root Directory：只限制到影视目录；
- 仅允许文件读取所需权限；
- 不允许创建、写入、移动、删除、离线下载、账号管理、Token管理等权限；
- 可以设置合理有效期；
- 不要把 CloudDrive2 主账号密码给 HomeSphere。

如果后续测试目录索引，再单独增加 List 权限；当前直链探针只需要验证读取能力。

## HomeSphere 配置

```env
HOMESPHERE_CD2_ENDPOINT=http://host.docker.internal:19798
HOMESPHERE_CD2_TOKEN=你的限目录只读Token
HOMESPHERE_CD2_PROBE_PATH=/115open/Movies/一个真实测试文件.mp4
HOMESPHERE_CD2_TIMEOUT_MS=8000
```

Token 只放服务器 `.env`，不要提交 GitHub，也不要贴到 Issue 或聊天中。

CloudDrive2 官方 Docker 示例使用 host network。HomeSphere 的 compose 已加入 `host.docker.internal:host-gateway`，同机部署推荐用 `http://host.docker.internal:19798` 访问 CD2。不要把 19798 放进公网反向代理；用主机防火墙限制到本机或管理局域网。

## 使用

登录 HomeSphere 后打开：

```text
/library/cd2
```

页面会显示：

- CD2 endpoint 主机；
- 测试文件名；
- 是否有 directUrl；
- directUrl 主机；
- 是否要求特定 User-Agent；
- User-Agent 是否与当前浏览器匹配；
- 额外 Header 的名称；
- 是否具备浏览器302候选条件。

不会显示：

- API Token；
- directUrl 完整值；
- 签名 query；
- 额外 Header 的值。

## 判定

### 候选 PASS

必须同时满足：

```text
directUrl = 有
final URL = 公网 HTTP(S)
additionalHeaders = 空
required userAgent = 空 或与当前 iPhone Safari 一致
```

此时页面才显示“打开测试直链”。

然后还必须在真实 iPhone/Safari 上验证：

- 能开始请求/播放；
- 拖动/Range 正常；
- 多次重新播放不过早失效；
- HomeSphere/VPS 不出现大流量视频字节；
- CD2/115没有异常高频请求。

### FAIL

以下任一情况都不应直接把 CD2 directUrl 作为 WebUI 302：

- 要求 `Referer`、Cookie 或其他额外 Header；
- 要求的 User-Agent 与浏览器不同；
- 没有 directUrl，只有 `downloadUrlPath`；
- directUrl 指向私网/回环；
- 真实 iPhone 无法访问。

如果 FAIL，HomeSphere 继续使用现有 STRM + 内网3xx Bridge，不退回视频字节代理。

## 实现说明

探针使用 Node 自带 HTTP/2 实现最小 unary gRPC，只实现：

```text
/clouddrive.CloudDriveFileSrv/GetDownloadUrlPath
```

没有引入完整 CloudDrive2 proto、protobuf runtime 或第三方 gRPC npm 依赖。

这保持了 HomeSphere 主运行时的体积和依赖边界。
