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
if [[ ! -x "$WORK/clip" || "$DIR/clip.swift" -nt "$WORK/clip" ]]; then rm -f "$WORK/clip"; swiftc -O -o "$WORK/clip" "$DIR/clip.swift" 2>/dev/null || rm -f "$WORK/clip"; fi
# 1. pictures the site could not download itself (shops that block datacenter addresses): fetch from here, upload
fq=$(curl -sS "${AUTH[@]}" "$SITE/api/media/fetch-queue")
echo "$fq" | python3 -c '
import sys,json
for q in json.load(sys.stdin).get("queue",[]): print(q["id"], q["upload"], q["url"])' | while read -r fid up url; do
  src="$WORK/$fid.bin"
  fail() { echo "fetch failed for $fid: $1"; curl -sS "${AUTH[@]}" -X POST -H 'content-type: application/json' -d "{\"reason\":\"$1\"}" "$SITE${up}/failed" >/dev/null; rm -f "$src"; }
  ctype=$(curl -sSL --compressed --max-time 60 -o "$src" -w '%{content_type}' "$url" || true)
  [[ -s "$src" ]] || { fail "download error"; continue; }
  mime=$(file -b --mime-type "$src")
  [[ "$ctype" == text/html* ]] && mime=text/html
  if [[ "$mime" == text/html ]]; then
    # a page, not a picture: take its og:image / twitter:image
    img=$(python3 -c '
import re,sys,html
t=open(sys.argv[1],"rb").read().decode("utf-8","ignore")
for pat in [r"property=[\"\x27]og:image(?::secure_url)?[\"\x27][^>]*content=[\"\x27]([^\"\x27]+)", r"content=[\"\x27]([^\"\x27]+)[\"\x27][^>]*property=[\"\x27]og:image", r"name=[\"\x27]twitter:image[\"\x27][^>]*content=[\"\x27]([^\"\x27]+)"]:
  m=re.search(pat,t,re.I)
  if m: print(html.unescape(m.group(1))); break' "$src")
    if [[ -z "$img" ]]; then fail "no og:image on page"; continue; fi
    if ! curl -sSL --compressed --max-time 60 -o "$src" "$img"; then fail "image download error"; continue; fi
    mime=$(file -b --mime-type "$src")
  fi
  if [[ "$mime" != image/* ]]; then fail "not an image ($mime)"; continue; fi
  curl -sS "${AUTH[@]}" -F "file=@$src;type=$mime;filename=picture.${mime#image/}" "$SITE$up" >/dev/null && echo "fetched picture for $fid"
  rm -f "$src"
done
# 2. cutouts / trims
queue=$(curl -sS "${AUTH[@]}" "$SITE/api/media/clip-queue")
echo "$queue" | python3 -c '
import sys,json
for q in json.load(sys.stdin)["queue"]: print(q["media_id"], q["original"], q["upload"], json.dumps(q.get("params",{})))' | while read -r id orig up params; do
  src="$WORK/$id.src"; out="$WORK/$id.png"
  curl -sS "${AUTH[@]}" -o "$src" "$SITE$orig" || continue
  flags=()
  [[ "$params" == *'"all": true'* || "$params" == *'"all":true'* ]] && flags+=(--all)
  [[ "$params" == *'"mode": "trim"'* || "$params" == *'"mode":"trim"'* ]] && flags+=(--trim)
  if [[ -x "$WORK/clip" ]]; then "$WORK/clip" "$src" "$out" ${flags[@]+"${flags[@]}"}; else swift "$DIR/clip.swift" "$src" "$out" ${flags[@]+"${flags[@]}"}; fi || { echo "clip failed for $id"; curl -sS "${AUTH[@]}" -X POST -H 'content-type: application/json' -d '{"reason":"no foreground found"}' "$SITE${up}/failed" >/dev/null; rm -f "$src"; continue; }
  curl -sS "${AUTH[@]}" -F "file=@$out;type=image/png" -F "provider=local" "$SITE$up" >/dev/null && echo "uploaded clip for $id"
  rm -f "$src" "$out"
done
