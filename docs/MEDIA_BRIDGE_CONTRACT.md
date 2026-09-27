# Media Bridge Contract

HomeSphere 只接受一种媒体接口：**STRM + 3xx 解析**。

```text
Storage
  │
  ▼
Media Bridge
  ├─ 持有存储授权
  ├─ 生成 STRM
  └─ 播放时返回 3xx
  │
  ├── /media/*.strm
  └── private HTTP endpoint
          ▲
          │
      HomeSphere
```

## STRM

每个 `.strm`：

1. 文件名用于作品 / 季 / 集识别；
2. 第一行必须是 HTTP(S) URL；
3. 推荐使用仅 HomeSphere 可访问的 Bridge 内网地址；
4. 不应长期保存临时 CDN URL；
5. HomeSphere 不解析也不保存网盘账号凭据。

示例：

```text
/media/TV/Silo/Season 01/Silo.S01E01.strm
```

内容：

```text
http://media-bridge:12333/play/xxxx
```

## 播放

```text
Client → HomeSphere /api/play/:id
       → HomeSphere server → private Bridge
       → Bridge 3xx → public CDN URL
       ← HomeSphere receives Location
       ← HomeSphere 302 client
Client → CDN
```

Bridge 必须返回 3xx。若返回 HTTP 200 视频字节，HomeSphere 会拒绝。

## 安全要求

- Bridge 管理端口不公开；
- HomeSphere 只访问 `HOMESPHERE_STRM_ALLOWED_HOSTS` 中的主机；
- 最终 CDN URL 必须为公网 HTTP(S)；
- 最终地址不得指向回环、私有、链路本地或保留网段；
- 点击播放时才解析临时 CDN URL；
- 不批量预解析；
- STRM 使用原子写入；
- STRM 目录只读挂载；
- HomeSphere 不实现任何网盘 Provider。

Bridge 的具体实现属于部署层，可以替换，不进入 HomeSphere 核心。
