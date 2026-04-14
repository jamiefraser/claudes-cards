#!/bin/bash
# scripts/download-sounds.sh
# Downloads (or creates placeholders for) CC0 sound assets per SPEC.md §10.1.
#
# In this implementation, placeholder files are created at the correct paths
# so the frontend can reference them without 404s. In production, replace
# each placeholder with the actual downloaded file from its source URL.
#
# TODO (production): Use a Freesound API token to download real files:
#   export FREESOUND_API_TOKEN=your-token-here
#   ./scripts/download-sounds.sh --real
#
# Usage:
#   ./scripts/download-sounds.sh              # create placeholders
#   ./scripts/download-sounds.sh --real       # attempt real downloads (requires FREESOUND_API_TOKEN)

set -euo pipefail

OUTPUT_DIR="apps/frontend/src/sound/assets"
REAL_DOWNLOAD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --real)
      REAL_DOWNLOAD=true
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

mkdir -p "$OUTPUT_DIR"

echo "=== Sound Asset Setup ==="
echo "Output directory: $OUTPUT_DIR"
echo ""

# ── Sound asset catalogue from SPEC.md §10.1 ──────────────────────────────────
# Format: filename|description|source|creator|url|license
declare -a SOUNDS=(
  "card-deal.mp3|Single card dealt to a position|Freesound|Cultureshock007|https://freesound.org/s/719539/|CC0"
  "card-flip.mp3|Card flipped face-up|Freesound|f4ngy|https://freesound.org/s/240776/|CC BY 3.0"
  "card-discard.mp3|Card placed on discard pile|Freesound|Cultureshock007|https://freesound.org/s/719539/|CC0"
  "card-draw.mp3|Card drawn from draw pile|Freesound|Cultureshock007|https://freesound.org/s/719539/|CC0"
  "card-shuffle.mp3|Deck shuffle at round start|Freesound|diammati|https://freesound.org/s/534981/|CC BY 3.0"
  "round-win.mp3|Round won|Freesound|Audeption|https://freesound.org/s/564920/|CC0"
  "game-win.mp3|Game won (full victory)|Freesound|Audeption|https://freesound.org/s/564920/|CC0"
  "game-lose.mp3|Game lost|Freesound|jhillam|https://freesound.org/s/431894/|CC0"
  "notification.mp3|DM / friend request / spectator alert|Pixabay|royalty-free|https://pixabay.com/sound-effects/|Royalty-free"
)

# Generated sounds are produced by scripts/generate-sounds.js, not downloaded.
declare -a GENERATED_SOUNDS=(
  "phase-complete.mp3"
  "skip-played.mp3"
  "peg-move.mp3"
)

# ── Create placeholders for downloaded sounds ──────────────────────────────────
# A placeholder is a minimal valid (but silent) MP3 file.
# This is a 1-frame MPEG-1 Layer 3 silence header (64 bytes) that Howler.js
# will load without error. Replace with real files before going to production.

# Minimal silent MP3 frame (MPEG1, Layer3, 32kbps, 44100Hz, mono, silence)
SILENT_MP3_HEX="fffbe4006400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"

create_placeholder() {
  local filepath="$1"
  local description="$2"
  local url="$3"

  if [[ -f "$filepath" ]] && [[ -s "$filepath" ]]; then
    echo "  SKIP (exists): $filepath"
    return
  fi

  # Write silent MP3 placeholder using printf with hex bytes
  printf '\xff\xfb\xe4\x00\x64\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' > "$filepath"
  printf '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' >> "$filepath"
  printf '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' >> "$filepath"
  printf '\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00' >> "$filepath"

  echo "  PLACEHOLDER: $filepath"
  echo "    TODO: Download from $url"
}

attempt_real_download() {
  local filename="$1"
  local url="$2"
  local filepath="$OUTPUT_DIR/$filename"

  if [[ -f "$filepath" ]] && [[ -s "$filepath" ]]; then
    echo "  SKIP (exists): $filepath"
    return 0
  fi

  if [[ -z "${FREESOUND_API_TOKEN:-}" ]]; then
    echo "  SKIP: FREESOUND_API_TOKEN not set — falling back to placeholder"
    create_placeholder "$filepath" "" "$url"
    return 0
  fi

  # Extract Freesound sound ID from URL (e.g. https://freesound.org/s/719539/ → 719539)
  local sound_id
  sound_id=$(echo "$url" | grep -oP '(?<=/s/)\d+(?=/)' || echo "")

  if [[ -z "$sound_id" ]]; then
    echo "  WARN: Cannot parse Freesound ID from $url — using placeholder"
    create_placeholder "$filepath" "" "$url"
    return 0
  fi

  # Freesound API: get sound preview URL
  local api_url="https://freesound.org/apiv2/sounds/${sound_id}/?token=${FREESOUND_API_TOKEN}"
  local preview_url
  preview_url=$(curl -sf "$api_url" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['previews']['preview-hq-mp3'])" 2>/dev/null || echo "")

  if [[ -z "$preview_url" ]]; then
    echo "  WARN: Could not fetch preview URL for sound $sound_id — using placeholder"
    create_placeholder "$filepath" "" "$url"
    return 0
  fi

  if curl -sf -o "$filepath" "$preview_url"; then
    local size
    size=$(stat -c%s "$filepath" 2>/dev/null || stat -f%z "$filepath" 2>/dev/null || echo "0")
    echo "  DOWNLOADED: $filepath ($size bytes)"
  else
    echo "  WARN: Download failed for $filename — using placeholder"
    create_placeholder "$filepath" "" "$url"
  fi
}

# ── Process Freesound / Pixabay sounds ────────────────────────────────────────
echo "Processing downloaded sound assets..."
for entry in "${SOUNDS[@]}"; do
  IFS='|' read -r filename description source creator url license <<< "$entry"
  filepath="$OUTPUT_DIR/$filename"

  if [[ "$REAL_DOWNLOAD" == "true" ]]; then
    attempt_real_download "$filename" "$url"
  else
    create_placeholder "$filepath" "$description" "$url"
  fi
done

echo ""

# ── Check generated sounds ─────────────────────────────────────────────────────
echo "Checking generated sound assets (from scripts/generate-sounds.js)..."
for filename in "${GENERATED_SOUNDS[@]}"; do
  filepath="$OUTPUT_DIR/$filename"
  if [[ -f "$filepath" ]] && [[ -s "$filepath" ]]; then
    echo "  OK: $filepath"
  else
    echo "  MISSING: $filepath — run: node scripts/generate-sounds.js"
    # Create placeholder so frontend doesn't 404
    create_placeholder "$filepath" "" "generated"
  fi
done

echo ""
echo "=== Summary ==="
echo "Sound asset directory: $OUTPUT_DIR"
echo ""

if [[ "$REAL_DOWNLOAD" == "false" ]]; then
  echo "TODO: These are PLACEHOLDER files (silent 1-frame MP3)."
  echo "      For production, run one of:"
  echo "        FREESOUND_API_TOKEN=<token> ./scripts/download-sounds.sh --real"
  echo "        node scripts/generate-sounds.js  (for generated sounds)"
  echo ""
  echo "Attribution required for CC BY 3.0 assets:"
  echo "  card-flip.mp3   — f4ngy (https://freesound.org/s/240776/) — CC BY 3.0"
  echo "  card-shuffle.mp3 — diammati (https://freesound.org/s/534981/) — CC BY 3.0"
  echo "  See /credits page in the platform for full attribution."
fi
