#!/usr/bin/env bash
# Exercise setup from a directory with no bundle or node_modules.
set -euo pipefail

source_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT

mkdir -p "$test_dir/vendor" "$test_dir/tests"
cp "$source_dir/package.json" "$source_dir/package-lock.json" "$test_dir/"
cp "$source_dir/setup_renderer.sh" "$source_dir/export_excalidraw.mjs" "$source_dir/render_template.html" "$test_dir/"
cp "$source_dir/vendor/entry.js" "$source_dir/vendor/VERSION" "$test_dir/vendor/"

EXCALIDRAW_SKIP_BROWSER_INSTALL=1 "$test_dir/setup_renderer.sh"
test -s "$test_dir/vendor/excalidraw-bundle.js"
test -d "$test_dir/node_modules/playwright"
test ! -d "$test_dir/node_modules/@excalidraw/excalidraw"
node "$test_dir/export_excalidraw.mjs" --help >/dev/null

echo "Cold renderer setup passed."
