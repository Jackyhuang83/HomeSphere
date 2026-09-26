# Media Bridge Validation

任何 Bridge 在被 HomeSphere 标记为“推荐”之前，都必须完成这套验收。

## A. 静态安全检查

片库页 Media Bridge 状态卡必须满足：

- Library Mode = STRM
- Playback Mode = resolve
- STRM 根目录可读
- HOMESPHERE_STRM_ALLOWED_HOSTS 已设置
- HomeSphere 环境中没有 HOMESPHERE_115_COOKIE
- 至少同步出一个可测试 STRM

只要 HomeSphere 在 STRM 模式下仍检测到115 Cookie，就不视为“凭据隔离完成”。

## B. 手动解析探测

点击片库页“测试播放链路”。HomeSphere 只取一条已经索引的 STRM，并执行一次真实解析。

合格结果只展示：

    Bridge Host → Public CDN Host

页面不会返回完整115临时 URL。

限制：

- 探测至少间隔30秒；
- 不批量测试；
- 不访问电影字节；
- Bridge 必须返回3xx；
- 最终地址必须是公网 HTTP(S)。

## C. iPhone 实机播放

至少验证：

1. Safari / PWA 登录正常；
2. 点击一部电影可起播；
3. 视频字节不经过 HomeSphere；
4. 拖动进度条可继续播放；
5. 暂停后继续播放正常；
6. 连续播放多个不同文件不会触发 Bridge 异常；
7. 电视剧至少验证两集切换。

## D. 网络链路确认

期望：

    iPhone → HomeSphere /api/play/:id
           → HomeSphere server-side → private Bridge
           → Bridge 302 final URL
           ← HomeSphere 302 final URL
           → iPhone directly → CDN

不合格：

    iPhone → HomeSphere → movie bytes
    iPhone → public Bridge management port
    HomeSphere → 115 account API
    Bridge → HTTP 200 video proxy bytes

## E. Bridge 侧账号策略

记录并确认：

- 使用的115授权方式；
- 是否官方开放平台；
- Bridge 版本；
- 同步目录范围；
- 是否禁止根目录全盘高频扫描；
- QPS / QPM / 重试策略；
- 直链是否点击播放时才获取；
- 是否关闭本地视频代理；
- 是否存在第三方共享 AppID / OAuth 服务依赖。

## F. 交付结论

验收记录分为：

- PASS：可以作为 HomeSphere 推荐 Bridge；
- COMPATIBLE：能用，但存在 Cookie / 第三方授权 / 维护等非理想因素；
- REJECTED：视频经过服务器、无法302、无法隔离凭据或风险不可接受。

没有完成真实115账号 + iPhone大文件播放前，不把候选写成“已验证推荐”。
