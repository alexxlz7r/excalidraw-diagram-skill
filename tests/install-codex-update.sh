#!/usr/bin/env bash
# Regression: updating a Codex plugin must keep the previous cache path readable
# for threads that were already open when the update started.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
fake_bin="$test_root/bin"
codex_home="$test_root/codex-home"
old_root="$codex_home/plugins/cache/excalidraw-diagram-skill/excalidraw-diagram-skill/1.2.0"
new_root="$codex_home/plugins/cache/excalidraw-diagram-skill/excalidraw-diagram-skill/1.2.1"
state_file="$test_root/version"

cleanup() {
  case "$test_root" in
    "${TMPDIR:-/tmp}"/*|/tmp/*|/var/folders/*) rm -rf -- "$test_root" ;;
  esac
}
trap cleanup EXIT

mkdir -p "$fake_bin" "$old_root/skills/excalidraw-diagram"
printf '1.2.0\n' >"$state_file"
printf '%s\n' '# old skill' >"$old_root/skills/excalidraw-diagram/SKILL.md"

cat >"$fake_bin/codex" <<'FAKE_CODEX'
#!/usr/bin/env bash
set -euo pipefail

case "$*" in
  "plugin marketplace list --json")
    printf '%s\n' '{"marketplaces":[{"name":"excalidraw-diagram-skill","marketplaceSource":{"sourceType":"git"}}]}'
    ;;
  "plugin marketplace upgrade excalidraw-diagram-skill")
    ;;
  "plugin list --json")
    version="$(cat "$FAKE_CODEX_STATE")"
    printf '{"installed":[{"pluginId":"excalidraw-diagram-skill@excalidraw-diagram-skill","version":"%s","installed":true}]}\n' "$version"
    ;;
  "plugin add excalidraw-diagram-skill@excalidraw-diagram-skill --json")
    mkdir -p "$FAKE_NEW_ROOT/skills/excalidraw-diagram/scripts"
    printf '%s\n' '# new skill' >"$FAKE_NEW_ROOT/skills/excalidraw-diagram/SKILL.md"
    printf '%s\n' '#!/usr/bin/env bash' 'sleep 0.3' >"$FAKE_NEW_ROOT/skills/excalidraw-diagram/scripts/setup_renderer.sh"
    chmod +x "$FAKE_NEW_ROOT/skills/excalidraw-diagram/scripts/setup_renderer.sh"
    python3 - "$FAKE_OLD_ROOT" <<'PY'
import subprocess
import sys

subprocess.Popen(
    ["sh", "-c", 'sleep 0.1; rm -rf -- "$1"', "sh", sys.argv[1]],
    start_new_session=True,
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
PY
    printf '1.2.1\n' >"$FAKE_CODEX_STATE"
    printf '{"installedPath":"%s"}\n' "$FAKE_NEW_ROOT"
    ;;
  *)
    printf 'Unexpected fake Codex invocation: %s\n' "$*" >&2
    exit 2
    ;;
esac
FAKE_CODEX
chmod +x "$fake_bin/codex"

PATH="$fake_bin:$PATH" \
  CODEX_HOME="$codex_home" \
  FAKE_CODEX_STATE="$state_file" \
  FAKE_OLD_ROOT="$old_root" \
  FAKE_NEW_ROOT="$new_root" \
  "$repo_root/install.sh" --codex

if [ ! -f "$old_root/skills/excalidraw-diagram/SKILL.md" ]; then
  printf 'FAIL: the previous Codex cache path no longer resolves\n' >&2
  exit 1
fi

printf 'PASS: the previous Codex cache path still resolves after update\n'
