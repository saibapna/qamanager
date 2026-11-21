# QA Manager PDF 71-item performance evidence (21 November 2026)

## Measured data (not end-to-end acceptance)
- Cloudflare Browser Rendering page.pdf benchmark: 71 synthetic test rows in a five-page A4 layout, five consecutive renders in one browser session: **388, 374, 373, 379, 377 ms**. p50 377 ms, nearest-rank p95 388 ms. PDF size 28,183 bytes.
- [GitHub Actions local 71-item PDF generation](https://github.com/saibapna/qamanager/actions/runs/44886851851): output printed ~2.06 seconds after step start (08:52:30.253 to 08:52:32.313 UTC). This runs local Node and Chromium, NOT the deployed Hono Worker.
- Both measurements EXCLUDE real UAT authentication, Hyperdrive/PostgreSQL, storage, and client network time. The only recorded production PDF was created before PDF timing metrics were enabled. **Real 71-item end-to-end Worker latency is UNVERIFIED.**

## Target and evidence needed
- Provisional operational target (not achieved evidence): p95 Worker end-to-end <=10 seconds for 71 items. The originally requested <=5-second acceptance remains unchanged without signed product-owner approval. Do not claim either limit was met by the component tests.
- Record at least 30 authorized real 71-item Worker PDF calls, representative cold and warm requests and expected concurrency. Use external HTTP elapsed time plus the existing qamanager_pdf_metrics log (render_ms, total_ms, page_count, bytes). Report p50, p95, max, error rate and verified five-page output.
- Investigate any call over 10 seconds; do not bypass revision snapshot integrity, PDF format checks or audit commits to meet a target.
- Component benchmark can be repeated using scripts/benchmark-71-item-browser-rendering.mjs with CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables in a private operator environment. Never commit or print the token.
- P3.08's measured <=5-second acceptance remains pending; this report documents the gap and a provisional, falsifiable engineering target. A genuine authenticated test account/dataset is required without changing existing UAT history.
