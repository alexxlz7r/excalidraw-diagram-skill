#!/usr/bin/env bash
# Install pinned renderer dependencies and build the local browser bundle.
set -euo pipefail

renderer_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$renderer_dir"

uv sync --locked
npm ci --no-audit --no-fund
npm run build:bundle
uv run playwright install chromium

echo "Excalidraw renderer is ready."
