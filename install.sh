#!/usr/bin/env bash
# Install the excalidraw-diagram skill for Codex.
# Claude Code users should install the marketplace plugin instead, so Claude does
# not discover both a plugin copy and a manually linked copy of the same skill.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skill_dir="$repo_dir/skills/excalidraw-diagram"
[ -d "$skill_dir" ] || { echo "ERROR: $skill_dir not found"; exit 1; }

codex_skills_dir="${CODEX_HOME:-$HOME/.codex}/skills"
destination="$codex_skills_dir/excalidraw-diagram"
mkdir -p "$codex_skills_dir"
if [ -d "$destination" ] && [ ! -L "$destination" ]; then
  echo "ERROR: $destination is a real directory; refusing to replace it."
  exit 1
fi
ln -sfn "$skill_dir" "$destination"
echo "linked $destination -> $skill_dir"

echo
echo "Setting up the renderer..."
"$skill_dir/references/setup_renderer.sh"
echo "Done."
