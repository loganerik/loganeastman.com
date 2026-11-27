#!/bin/zsh
# Pulls pending cutouts from the site, runs clip.swift, uploads the PNG. Run by launchd every 10 minutes
# (and safe to run by hand). Needs: SITE (e.g. https://loganeastman.com) and an owner session cookie or a
# Cloudflare Access service token in CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET.
set -euo pipefail
SITE="${SITE:-https://loganeastman.com}"
DIR="$(cd "$(dirname "$0")" && pwd)"
WORK="${TMPDIR:-/tmp}/lem-clip"; mkdir -p "$WORK"
AUTH=()
if [[ -n "${CF_ACCESS_CLIENT_ID:-}" ]]; then AUTH=(-H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET"); fi
if [[ -n "${LEM_COOKIE:-}" ]]; then AUTH+=(-H "Cookie: $LEM_COOKIE"); fi
if [[ -z "${LEM_TOKEN:-}" && -f "$HOME/.lem-agent-token" ]]; then LEM_TOKEN="$(cat "$HOME/.lem-agent-token")"; fi
if [[ -n "${LEM_TOKEN:-}" ]]; then AUTH+=(-H "Authorization: Bearer $LEM_TOKEN"); fi
if [[ ! -x "$WORK/clip" ]]; then swiftc -O -o "$WORK/clip" "$DIR/clip.swift" 2>/dev/null || true; fi
queue=$(curl -sS "${AUTH[@]}" "$SITE/api/media/clip-queue")
echo "$queue" | python3 -c '
import sys,json
for q in json.load(sys.stdin)["queue"]: print(q["media_id"], q["original"], q["upload"], json.dumps(q.get("params",{})))' | while read -r id orig up params; do
  src="$WORK/$id.src"; out="$WORK/$id.png"
  curl -sS "${AUTH[@]}" -o "$src" "$SITE$orig" || continue
  flags=()
  [[ "$params" == *'"all": true'* || "$params" == *'"all":true'* ]] && flags+=(--all)
  if [[ -x "$WORK/clip" ]]; then "$WORK/clip" "$src" "$out" "${flags[@]}"; else swift "$DIR/clip.swift" "$src" "$out" "${flags[@]}"; fi || { echo "clip failed for $id"; curl -sS "${AUTH[@]}" -X POST -H 'content-type: application/json' -d '{"reason":"no foreground found"}' "$SITE${up}/failed" >/dev/null; rm -f "$src"; continue; }
  curl -sS "${AUTH[@]}" -F "file=@$out;type=image/png" -F "provider=local" "$SITE$up" >/dev/null && echo "uploaded clip for $id"
  rm -f "$src" "$out"
done
