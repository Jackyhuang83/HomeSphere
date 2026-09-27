# Media Bridge Validation

任何 Bridge 在用于 HomeSphere 前，都按同一标准验证。

## 1. 静态检查

- STRM 根目录可读；
- `HOMESPHERE_STRM_ALLOWED_HOSTS` 已配置；
- 至少存在一个可测试 STRM；
- HomeSphere 本身没有网盘凭据或网盘 API 配置。

## 2. 单条解析探测

片库页点击“测试播放链路”。

要求：

- 每次只取一个 STRM；
- 至少间隔 30 秒；
- Bridge 返回 3xx；
- 最终地址为公网 HTTP(S)；
- 页面只显示 Bridge Host、最终 CDN Host 和耗时；
- 不读取视频字节。

## 3. iPhone 实机

至少验证：

1. Safari / PWA 登录；
2. 电影正常起播；
3. 拖动进度条；
4. 暂停后继续；
5. 连续播放多个文件；
6. 电视剧至少两集切换；
7. 视频字节不经过 HomeSphere。

## 4. 合格链路

```text
iPhone → HomeSphere
       → private Bridge
       → Bridge 3xx
       ← HomeSphere 302
iPhone → CDN
```

不合格：

- HomeSphere 直接调用网盘账号 API；
- HomeSphere 或 Bridge 向客户端代理完整视频字节；
- Bridge 管理端口直接公开；
- STRM 指向未允许的内网主机。
