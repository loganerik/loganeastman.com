#!/bin/zsh
# Mirrors R2 originals into the vault so Obsidian resolves ![[photos/…]] locally, and pushes anything you
# dropped into attachments/orig/ up to R2. Copy only (never delete). Requires `brew install rclone` and an
# rclone remote named `r2` (R2 API token scoped to the loganeastman-media bucket).
set -euo pipefail
VAULT="${VAULT:-$HOME/Erik/website/vault}"
BUCKET="${BUCKET:-r2:loganeastman-media}"
rclone copy "$BUCKET/orig" "$VAULT/attachments/orig" --checksum --transfers 8 --quiet
rclone copy "$VAULT/attachments/orig" "$BUCKET/orig" --checksum --transfers 8 --quiet --exclude ".DS_Store"
if [[ -n "${SITE:-}" ]]; then curl -sS -X POST "$SITE/api/media/scan" ${LEM_COOKIE:+-H "Cookie: $LEM_COOKIE"} >/dev/null || true; fi
