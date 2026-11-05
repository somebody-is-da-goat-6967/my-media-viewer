#!/usr/bin/env bash
# Rebuilds manifest.json from whatever is currently in your media-* releases.
# Usage: ./manifest.sh [owner/repo]
set -euo pipefail
REPO="${1:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
mapfile -t tags < <(gh release list -R "$REPO" --limit 1000 --json tagName --jq '.[].tagName' \
  | grep "^media-[0-9]\+$" | sort -t- -k2 -n)
for tag in "${tags[@]}"; do
  gh release view "$tag" -R "$REPO" --json assets \
    --jq '.assets[] | select(.state=="uploaded") | .url'
done | jq -R . | jq -s . > manifest.json
echo "Wrote manifest.json with $(jq length manifest.json) entries."
