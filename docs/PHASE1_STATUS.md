# OneHubX Movies — Phase 1 development status

## Baseline

- Frontend/web shell: LibreTV main @ `9227538a6f2d907aba984178567056850e80dab6`
- 115 implementation reference: OpenStrm main @ `8acd53a30b352b0ea281caafba3a42d2b91657f8`
- Target: private family website, about 1–5 concurrent users, iPhone-first WebUI.

## Implemented in this slice

- 30-day HMAC-signed HttpOnly family session cookie.
- Strict whole-site client gate: private pages do not render before authentication.
- No-index metadata/robots hints for the private site.
- `CloudProvider` abstraction with reserved `quark` provider kind.
- Minimal **read-only** 115 provider:
  - directory listing;
  - path resolution;
  - pick_code lookup;
  - on-demand direct playback URL resolution;
  - conservative request queue/rate limit;
  - bounded retry/backoff;
  - no rename/delete/offline-download/share-write operations.
- SQLite media index under `/data/onehubx.sqlite`.
- Explicit/manual 115 media-directory scan; normal page browsing never triggers a scan.
- Private media APIs:
  - `GET /api/library`
  - `GET /api/library/search?q=`
  - `POST /api/library/sync`
  - `GET /api/play/:id` → authenticated HTTP 302
- Mobile-first `/library` page and basic private playback page.
- Docker persistent `/data` volume.
- Existing LibreTV recommendations and IPTV code are left intact in this slice.

## Safety / 115 risk-control defaults

Defaults are deliberately conservative:

- `ONEHUBX_115_MAX_CONCURRENT=1`
- `ONEHUBX_115_MAX_RPS=1`
- only retry transient network/429/5xx failures;
- do **not** hammer 401/403/405 or business errors;
- media scans are explicit, never caused by browsing/searching;
- direct playback URL is obtained only when `/api/play/:id` is requested;
- no proxy pool, IP rotation, account rotation or other bypass mechanisms.

## Not implemented yet

This is the first development slice, not the finished MVP.

- TMDB scraping/matching and poster wall enrichment.
- OpenStrm-grade incremental change monitor / stale-file deletion reconciliation.
- Quark provider implementation (interface reserved only).
- Recommendation → "search my 115" linkage.
- IPTV same-channel multi-source aggregation enhancements.
- Replace private watch page with the full LibreTV ArtPlayer experience.
- Remove/disable LibreTV public CMS VOD providers from product UI.
- Admin WebUI for provider credentials/directories and TMDB correction.
- Automated scheduled sync.

## Important credential note

`ONEHUBX_115_COOKIE` is a sensitive credential. It must stay in the server environment only. Never commit it to Git, expose it to browser JavaScript, logs, screenshots, or client APIs.
