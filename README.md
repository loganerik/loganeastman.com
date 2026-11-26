# loganeastman.com

Single-owner publishing platform. One Obsidian-compatible Markdown vault (private git repo,
cloned at `./vault`) is the only content
store. Three ways to edit it: the site itself (`/private`), Obsidian, or an AI agent through the
MCP/REST tools on the worker.

```
packages/vault-core   schemas, frontmatter parse/serialize, ids, wikilinks, publicness
packages/providers    TMDB, Open Library, MusicBrainz, OpenGraph fetchers
site/                 Astro, static output; theme/ is the swappable identity layer
worker/               Cloudflare Worker: /api, /mcp, /m, /share, cron, Durable Objects
tools/mac/            launchd jobs that run when the Mac is awake (media sync, local cutouts)
```

See `docs/` for the content model and the runbook.
