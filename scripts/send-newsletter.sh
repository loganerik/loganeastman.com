#!/usr/bin/env bash
# send-newsletter.sh — Send a newsletter issue to Buttondown as a draft
# Usage: ./scripts/send-newsletter.sh <issue-slug>
# Requires: BUTTONDOWN_API_KEY env var

set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Usage: $0 <issue-slug>"
  echo "Example: $0 my-first-issue"
  exit 1
fi

SLUG="$1"
FILE="content/newsletter/${SLUG}.md"

if [ ! -f "$FILE" ]; then
  echo "Error: $FILE not found"
  exit 1
fi

if [ -z "${BUTTONDOWN_API_KEY:-}" ]; then
  echo "Error: BUTTONDOWN_API_KEY not set"
  exit 1
fi

# Extract title from frontmatter
TITLE=$(sed -n 's/^title: *"\(.*\)"/\1/p' "$FILE" | head -1)
if [ -z "$TITLE" ]; then
  TITLE=$(sed -n "s/^title: *'\(.*\)'/\1/p" "$FILE" | head -1)
fi

# Extract body (everything after the closing ---)
BODY=$(awk '/^---$/{c++; next} c>=2' "$FILE")

# Send to Buttondown as draft
RESPONSE=$(curl -s -X POST \
  -H "Authorization: Token $BUTTONDOWN_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg title "$TITLE" --arg body "$BODY" \
    '{subject: $title, body: $body, status: "draft"}')" \
  "https://api.buttondown.com/v1/emails")

echo "Draft created in Buttondown."
echo "$RESPONSE" | jq -r '.id // "Check Buttondown for preview."'
