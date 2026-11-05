# MasoomDev Videos — Cloudflare migration package

- `src/worker.js`: Google OAuth + PKCE, D1 session/share registry, encrypted Drive credentials, verified Google Drive streaming.
- `schema.sql`: durable D1 schema.
- `public/`: existing working MasoomDev Videos UI + 100 MiB IndexedDB player.
- `extension/`: existing recorder integration, default upload URL changed to https://videos.masoomdev.online (localhost still allowed in URL setting).
- `wrangler.jsonc`: Cloudflare configuration; replace database ID.
- `DEPLOYMENT.md`: full step-by-step deployment instructions.

**Status:** code syntax checked, not deployed, no live Cloudflare OAuth/Drive integration test yet. Back up the known-good local Phase 2 build and its `.env` separately. Production requires your own Cloudflare login, domain DNS and Google Cloud OAuth configuration.

## GitHub source repository
https://github.com/shayanmila/masoomdev-videos

See `GITHUB-UPLOAD.md` for safe initial commit instructions. Do not connect a Cloudflare automatic deployment while the D1 database ID is still a placeholder.
