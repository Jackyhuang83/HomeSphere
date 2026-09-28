# Third-Party Notices

## LibreTV

HomeSphere is derived from LibreTV.

Upstream: https://github.com/LibreSpark/LibreTV

HomeSphere remains licensed under AGPL-3.0-or-later. See `LICENSE`.


## Public IPTV playlist presets

HomeSphere includes optional preset links to public M3U projects for personal playlist discovery:

- iptv-org/iptv — https://github.com/iptv-org/iptv
- IPTV-CN/IPTV — https://github.com/IPTV-CN/IPTV\n- vbskycn/iptv — https://github.com/vbskycn/iptv\n- hujingguang/ChinaIPTV — https://github.com/hujingguang/ChinaIPTV

HomeSphere does not bundle, host, mirror, or redistribute the video streams referenced by those playlists. Availability, licensing, geographic restrictions, and stream ownership remain the responsibility of the corresponding upstream sources.


## QMediaSync

HomeSphere uses QMediaSync as an optional deployment-side Media Bridge for 115 Open Platform authorization, STRM generation, and direct-link resolution.

Upstream: https://github.com/qicfan/qmediasync

QMediaSync is licensed under GPL-3.0. HomeSphere does not bundle QMediaSync source code into its application image; it references the upstream Docker image as a separate service.
