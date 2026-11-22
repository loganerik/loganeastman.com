#!/bin/zsh
# Keeps this checkout in sync with GitHub so columns written in the web editor
# (Decap at /admin) are backed up on this Mac. Runs from launchd every 30 minutes.
# git itself refuses a pull that would overwrite local edits, so nothing is clobbered.
set -u
REPO="/Users/logan/Erik/website"
LOG="$HOME/Library/Logs/tryhard-backup.log"
cd "$REPO"
if git pull -q --ff-only origin main; then
  echo "$(date '+%F %T') ok: $(git log -1 --format='%h %s')" >> "$LOG"
else
  echo "$(date '+%F %T') pull failed (local edits in the way?)" >> "$LOG"
fi
