#!/usr/bin/env bash
# Uploads media to GitHub Releases in batches of 900 and regenerates manifest.json.
#
# Usage:  ./upload.sh <media-folder> [owner/repo]
# Needs:  gh (logged in), jq
#
# Safe to re-run: files already uploaded are skipped, and new files fill the
# newest release first, then spill into a new one when it hits 900 assets.

set -euo pipefail

SRC="${1:?Usage: $0 <media-folder> [owner/repo]}"
REPO="${2:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
PREFIX="media-"
MAX=900                      # assets per release (GitHub's limit is 1000)
CHUNK=20                     # files per upload call, so an interruption loses little
LIMIT=$((2 * 1024 * 1024 * 1024 - 1))   # 2 GB per-asset limit
OUT="${MANIFEST:-manifest.json}"

command -v jq >/dev/null || { echo "jq is required"; exit 1; }
[ -d "$SRC" ] || { echo "Not a folder: $SRC"; exit 1; }

echo "Repo: $REPO"

# --- Find existing media releases and the assets already in them -------------
declare -A have=()
declare -A counts=()
cur=0

mapfile -t tags < <(gh release list -R "$REPO" --limit 1000 --json tagName --jq '.[].tagName' \
  | grep "^${PREFIX}[0-9]\+$" | sort -t- -k2 -n || true)

for tag in "${tags[@]}"; do
  n=0
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    have["$name"]=1
    n=$((n + 1))
  done < <(gh release view "$tag" -R "$REPO" --json assets --jq '.assets[] | select(.state=="uploaded") | .name')
  counts["$tag"]=$n
  num="${tag#"$PREFIX"}"
  (( num > cur )) && cur=$num
done

count=0
if (( cur > 0 )); then count=${counts["$PREFIX$cur"]:-0}; fi

# --- Work out what still needs uploading -------------------------------------
pending=()
while IFS= read -r -d '' f; do
  name="$(basename "$f")"
  if [[ "$name" =~ [^A-Za-z0-9._-] ]]; then
    echo "SKIP (rename it, only letters/digits/._- are safe): $name"
    continue
  fi
  size=$(wc -c < "$f")
  if (( size > LIMIT )); then
    echo "SKIP (over 2 GB, compress it first): $name"
    continue
  fi
  [[ -n "${have[$name]:-}" ]] && continue
  pending+=("$f")
done < <(find "$SRC" -maxdepth 1 -type f -print0 | sort -z)

echo "Already uploaded: ${#have[@]}   To upload: ${#pending[@]}"

# --- Upload ------------------------------------------------------------------
batch=()
DELAY="${DELAY:-2}"          # seconds to pause between files (keeps under rate limits)

upload_one() {
  local f="$1" tries=0
  until gh release upload "$PREFIX$cur" "$f" -R "$REPO" --clobber; do
    tries=$((tries + 1))
    if (( tries >= 5 )); then
      echo "Giving up on $f. Re-run the script later to continue."
      return 1
    fi
    echo "Upload failed (possibly rate limited). Waiting 10 minutes, retry $tries/5..."
    sleep 600
  done
  sleep "$DELAY"
}

flush() {
  local f
  if (( ${#batch[@]} > 0 )); then
    for f in "${batch[@]}"; do
      upload_one "$f" || exit 1
    done
    batch=()
  fi
}

done_count=0
for f in "${pending[@]}"; do
  if (( cur == 0 || count >= MAX )); then
    flush
    cur=$((cur + 1))
    count=0
    echo "Creating release $PREFIX$cur"
    gh release create "$PREFIX$cur" -R "$REPO" --title "Media $cur" --notes "Media batch $cur"
  fi
  batch+=("$f")
  count=$((count + 1))
  done_count=$((done_count + 1))
  if (( ${#batch[@]} >= CHUNK )); then
    flush
    echo "  uploaded $done_count / ${#pending[@]}"
  fi
done
flush
echo "Upload done."

# --- Regenerate manifest -----------------------------------------------------
mapfile -t tags < <(gh release list -R "$REPO" --limit 1000 --json tagName --jq '.[].tagName' \
  | grep "^${PREFIX}[0-9]\+$" | sort -t- -k2 -n || true)

for tag in "${tags[@]}"; do
  gh release view "$tag" -R "$REPO" --json assets --jq '.assets[] | select(.state=="uploaded") | .url'
done | jq -R . | jq -s . > "$OUT"

echo "Wrote $OUT with $(jq length "$OUT") entries."
echo "Next: git add $OUT && git commit -m 'Update manifest' && git push"
