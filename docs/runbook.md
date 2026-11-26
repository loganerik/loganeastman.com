# Runbook

## Local development

```
npm install                      # once, at refresh/
npm run dev                      # Astro on http://127.0.0.1:4330 (reads ../vault)
npm run dev:worker               # Worker on http://127.0.0.1:8787 (serves site/dist + /api, /mcp, /m, /share)
npm run build                    # site → site/dist (+ public-manifest.json, private-leak check)
npm test                         # vault-core + providers unit tests
```

The worker serves `site/dist`, so run `npm run build` to refresh what it serves. With `DEV_BYPASS_ACCESS=1`
in `worker/.dev.vars` every request counts as the owner.

### Running the pipeline without credentials
`worker/test/mock-upstream.mjs` stands in for TMDB and GitHub (in-memory copy of the vault folder):

```
cd worker && VAULT_PATH=../../vault node test/mock-upstream.mjs
```

`worker/.dev.vars` points `GITHUB_API_URL`, `TMDB_BASE_URL`, `TMDB_IMAGE_URL`, `PAGE_PROXY_URL` at it.
Remove those four lines (and set real tokens) to talk to the real services. `GET /github/_state` on the
mock dumps its vault; `POST /github/_reset` reloads from disk.

## Credentials and where they go

| Secret | Used by | How to create |
|---|---|---|
| `GITHUB_TOKEN` | worker (vault commits, site dispatch, reindex) | GitHub → Settings → Developer settings → Fine-grained token; repos `loganerik/vault` (Contents: read/write) and `loganerik/loganeastman.com` (Contents: read/write, needed for `repository_dispatch`). |
| `GITHUB_WEBHOOK_SECRET` | worker | Any long random string; also set on the vault repo webhook (below). |
| `TMDB_TOKEN` | worker | themoviedb.org → Settings → API → "API Read Access Token" (v4 bearer). Free. |
| `OPENAI_API_KEY` | worker (built-in processor) | platform.openai.com. Only needed for ambiguous captures; URL-identified films work without it. |
| `REPLICATE_TOKEN` | worker (cutouts, Stage 4) | replicate.com → API tokens. |
| `TOKEN_PEPPER` | worker (agent tokens) | Any long random string. Changing it invalidates every agent token. |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` | worker | From the Cloudflare Access application (below). |
| `CF_ZONE_ID`, `CF_PURGE_TOKEN` | worker (cache purge on privacy flips) | Cloudflare dashboard → zone → API token with Cache Purge. |
| `VAULT_READ_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub Actions on the site repo | Fine-grained token with Contents: read on `loganerik/vault`; Cloudflare token with Workers Scripts: edit, D1: edit, Workers R2: edit, Workers KV: edit. |
| `SITE_DISPATCH_TOKEN` | GitHub Actions on the vault repo | Fine-grained token with Contents: write on `loganerik/loganeastman.com` (dispatch needs it). |

Worker secrets: `cd worker && npx wrangler secret put NAME`. Locally: `worker/.dev.vars`.

## Cloudflare setup (one time)

1. `npx wrangler login` (interactive, opens a browser).
2. Create resources and paste the ids into `worker/wrangler.jsonc`:
   ```
   npx wrangler d1 create loganeastman        # → database_id
   npx wrangler kv namespace create KV        # → id
   npx wrangler r2 bucket create loganeastman-media
   ```
   (The old `WISHLIST_DB` D1 from the Hugo site can be reused instead of creating one: `npx wrangler d1 list`.)
3. `cd worker && npx wrangler d1 migrations apply DB --remote`
4. Build + deploy once by hand: `npm run build && cd worker && npx wrangler deploy` → `https://loganeastman-com.<account>.workers.dev`.
5. **Access**: Zero Trust → Access → Applications → Self-hosted. Domain `loganeastman.com`, paths `/private`, `/api`, `/share` (add the workers.dev host too while testing). Policy: Allow, emails = yours (one-time PIN). Session 1 month. Then add a **Bypass** policy for paths `/mcp` and `/api/tools` (agents use bearer tokens) and for `/api/github/webhook`, `/m`, `/api/health`, `/api/me` (public; `/api/me` must return 401 for visitors, not an Access login page). Copy the application's AUD tag → `ACCESS_AUD`; team name → `ACCESS_TEAM_DOMAIN`.
6. **Custom domain**: Workers → loganeastman-com → Settings → Domains & Routes → add `loganeastman.com` (and `www`). Remove the Pages project's custom domain first.
7. **Vault webhook**: GitHub → loganerik/vault → Settings → Webhooks → `https://loganeastman.com/api/github/webhook`, content type JSON, secret = `GITHUB_WEBHOOK_SECRET`, event: pushes only.
8. **Vault notify workflow**: copy `docs/vault-notify-site.yml` to `.github/workflows/notify-site.yml` in the vault repo; add `SITE_DISPATCH_TOKEN` there.
9. Site repo Actions secrets: `VAULT_READ_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
10. After the first deploy: `curl -X POST https://loganeastman.com/api/reindex` while signed in (or from `/private`), so the records index knows the existing vault.

## Phone capture
Open `https://loganeastman.com/private/` once in Safari, sign in through Access, then Share → Add to Home Screen.
The app registers as a share target: from any app, Share → "LE" opens `/share` prefilled with the link.

## Obsidian
Open `/Users/logan/Erik/website/vault` as a vault. Install **Obsidian Git**: auto pull 2 min, auto commit-and-push 3 min, pull before push. Conflicts show as standard markers; the site excludes a conflicted file until it is resolved (either in Obsidian or in /private).

## Agents (MCP)
Mint a token in `/private` (or `POST /api/tokens {"name":"claude"}`), then connect:
- Claude Code: `claude mcp add --transport http loganeastman https://loganeastman.com/mcp --header "Authorization: Bearer lem_…"`
- Anything else: Streamable HTTP at `/mcp`, bearer auth. REST mirror: `POST /api/tools/<name>`.
Tools: `inbox_list`, `inbox_get`, `capture_claim`, `capture_organize`, `item_enrich`, `records_search`, `records_read`, `records_link`, `owner_ask`, `inbox_process`.

## Photos and cutouts
- Drop or paste an image in the editor → it uploads to R2 (`orig/`, private), small WebP derivatives are made, and an
  Obsidian embed `![[photos/<media>/<name>]]` is inserted. `_media/index.json` in the vault maps that path to the public URLs.
- `/api/photos` (the + sheet's Photo mode, or the hub) makes a wall photo record under `items/photos/`; it is public
  only after you approve it (editor → Approved, or `POST /api/photos/:id/approve`).
- Cutouts: with `REPLICATE_TOKEN` set they run in the cloud (`CLIP_MODEL`, default `men1scus/birefnet`). Without it, they
  wait for the Mac: `tools/mac/clip-sync.sh` (launchd, every 10 min) runs Apple Vision and uploads the PNG. Replace a poor
  one any time: Artwork → Regenerate, or `POST /api/media/:id/variants/clip/regenerate {"provider":"local"}`.
- `tools/mac/media-sync.sh` mirrors originals into `vault/attachments/orig/` so Obsidian previews them offline.
  See `tools/mac/README.md` for the launchd install and auth.
