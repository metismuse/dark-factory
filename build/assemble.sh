#!/bin/bash
# Copy the canonical pocketful source into stage-1..stage-4.
# Each stage folder is a complete service; the stage is pinned by the
# Dockerfile's POCKETFUL_STAGE env var (stage-N/ must not serve later stages).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
for n in 1 2 3 4; do
  d="$HERE/../stage-$n"
  rm -rf "$d/src"
  mkdir -p "$d/src"
  cp "$HERE/src/server.js" "$HERE/src/ledger.js" "$HERE/src/ui.js" "$d/src/"
done
echo "assembled stage-1..stage-4"
