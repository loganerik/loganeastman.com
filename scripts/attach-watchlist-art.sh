#!/bin/zsh
# Queue TMDB poster + logo derivation for each imported film (reads scripts/.watchlist-attach.json).
set -u
TOKEN="${LEM_TOKEN:-$(cat ~/.lem-agent-token)}"
SITE="${SITE:-https://loganeastman.com}"
ok=0; missing=0; fail=0
python3 -c '
import json
for a in json.load(open("scripts/.watchlist-attach.json")):
    print(a["slug"], a.get("poster") or "-", a.get("logo") or "-")' | while read -r slug poster logo; do
  rid=$(curl -sS -H "Authorization: Bearer $TOKEN" -X POST -H 'content-type: application/json' -d "{\"q\":\"$slug\",\"kind\":\"film\",\"limit\":5}" "$SITE/api/tools/records_search" | python3 -c "
import sys,json
d=json.load(sys.stdin).get('result',{})
rows=d.get('records') or d.get('results') or []
m=[r for r in rows if r.get('path','').endswith('/$slug')]
print(m[0]['id'] if m else '')")
  if [[ -z "$rid" ]]; then echo "not indexed yet: $slug"; missing=$((missing+1)); continue; fi
  body="{\"record_id\":\"$rid\""
  [[ "$poster" != "-" ]] && body+=",\"poster\":\"$poster\""
  [[ "$logo" != "-" ]] && body+=",\"logo\":\"$logo\""
  body+="}"
  if curl -sS -H "Authorization: Bearer $TOKEN" -X POST -H 'content-type: application/json' -d "$body" "$SITE/api/tools/media_attach" | grep -q '"queued":true'; then ok=$((ok+1)); else echo "failed: $slug"; fail=$((fail+1)); fi
  sleep 0.3
done
