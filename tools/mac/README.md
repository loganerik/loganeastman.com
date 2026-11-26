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

Auth for the scripts: either a Cloudflare Access **service token** (Zero Trust → Access → Service Auth), exported as
`CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` in the plist's EnvironmentVariables and allowed by the Access policy,
or `LEM_COOKIE="CF_Authorization=…"` copied from a signed-in browser (expires with the session).
