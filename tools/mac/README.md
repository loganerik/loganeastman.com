# Mac-side tools (run when the Mac is awake)

- `clip.swift` — Apple Vision foreground cutout → transparent PNG. `swift clip.swift in.jpg out.png [--all] [--pad 0.04]`
- `clip-sync.sh` — asks the site for pending local cutouts, runs clip.swift, uploads the result.
- `media-sync.sh` — rclone mirror of R2 `orig/` ⇄ `vault/attachments/orig/` (copy only).
- `com.loganeastman.*.plist` — launchd jobs (every 10 min, and at login). Install:

```
cp tools/mac/com.loganeastman.*.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.loganeastman.clip-sync.plist
launchctl load ~/Library/LaunchAgents/com.loganeastman.media-sync.plist
```

Auth for the scripts: simplest is an **agent token** minted in /private → Agents, saved to `~/.lem-agent-token`
(the script reads it automatically). Alternatives: a Cloudflare Access **service token** (Zero Trust → Access → Service Auth), exported as
`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` in the plist's EnvironmentVariables and allowed by the Access policy,
or `LEM_COOKIE="CF_Authorization=…"` copied from a signed-in browser (expires with the session).

## Pictures the site cannot download itself

Some shops (Aesop, La Roche-Posay) refuse Cloudflare's addresses. When the Worker gets a 403 or similar for a
picture URL it puts the URL in a fetch queue instead of failing; `clip-sync.sh` downloads it from here on its
next run, uploads it to `/api/media/fetch/<id>`, and the site makes the derivatives and queues the usual
cutout (products) or trim (covers). `GET /api/media/fetch-queue` shows what is waiting. If a shop hands even
the Mac a bot-challenge page, paste the picture into the editor's Cover & artwork panel instead.
