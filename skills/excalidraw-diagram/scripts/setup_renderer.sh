#!/usr/bin/env bash
# Build the local Excalidraw bundle and retain only the Playwright runtime.
set -euo pipefail

renderer_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$renderer_dir"

npm ci --no-audit --no-fund
npm run build:bundle
npm prune --omit=dev --no-audit --no-fund

if [ "${EXCALIDRAW_SKIP_BROWSER_INSTALL:-0}" != "1" ]; then
  npx playwright install chromium
fi

echo "Excalidraw exporter is ready."
