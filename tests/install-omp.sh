#!/usr/bin/env bash
# Regression: install.sh --omp must drive the omp plugin CLI correctly for a
# fresh install and for an update, and run renderer setup inside the install
# path omp reports.
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
test_root="$(mktemp -d)"
fake_bin="$test_root/bin"
state_dir="$test_root/state"
calls_file="$state_dir/calls"
root_a="$test_root/cache/excalidraw-diagram-skill___excalidraw-diagram___1.5.0"
root_b="$test_root/cache/excalidraw-diagram-skill___excalidraw-diagram___1.5.1"
marker="$state_dir/setup-ran"

cleanup() {
  case "$test_root" in
    "${TMPDIR:-/tmp}"/*|/tmp/*|/var/folders/*) rm -rf -- "$test_root" ;;
  esac
}
trap cleanup EXIT

mkdir -p "$fake_bin" "$state_dir"
: >"$calls_file"

cat >"$fake_bin/omp" <<'FAKE_OMP'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"$FAKE_OMP_CALLS"

emit_list() {
  if [ -e "$FAKE_OMP_STATE/installed" ]; then
    printf '{"npm":[],"marketplace":[{"id":"excalidraw-diagram@excalidraw-diagram-skill","entries":[{"scope":"user","installPath":"%s","version":"1.5.0"}]}]}\n' "$FAKE_OMP_ROOT"
  else
    printf '{"npm":[],"marketplace":[]}\n'
  fi
}

build_root() {
  mkdir -p "$FAKE_OMP_ROOT/skills/excalidraw-diagram/scripts"
  printf '%s\n' '# skill' >"$FAKE_OMP_ROOT/skills/excalidraw-diagram/SKILL.md"
  cat >"$FAKE_OMP_ROOT/skills/excalidraw-diagram/scripts/setup_renderer.sh" <<'SETUP'
#!/usr/bin/env bash
printf '%s\n' "$FAKE_OMP_ROOT" >"$FAKE_OMP_MARKER"
SETUP
  chmod +x "$FAKE_OMP_ROOT/skills/excalidraw-diagram/scripts/setup_renderer.sh"
  touch "$FAKE_OMP_STATE/installed"
}

case "$2" in
  marketplace)
    case "$3" in
      add)
        if [ -n "${FAKE_OMP_ADD_FAIL:-}" ]; then
          printf '%s\n' 'Failed to add marketplace: Error: network unreachable' >&2
          exit 1
        fi
        if [ -e "$FAKE_OMP_STATE/added" ]; then
          printf '%s\n' 'Failed to add marketplace: Error: Marketplace "excalidraw-diagram-skill" already exists' >&2
          exit 1
        fi
        touch "$FAKE_OMP_STATE/added"
        ;;
      update) : ;;
      *) printf 'Unexpected fake omp invocation: %s\n' "$*" >&2; exit 2 ;;
    esac
    ;;
  list)
    emit_list
    ;;
  install)
    build_root
    ;;
  upgrade)
    build_root
    ;;
  *)
    printf 'Unexpected fake omp invocation: %s\n' "$*" >&2
    exit 2
    ;;
esac
FAKE_OMP
chmod +x "$fake_bin/omp"

assert_call() {
  grep -qxF "$1" "$calls_file" || { printf 'FAIL: missing omp call: %s\n' "$1" >&2; exit 1; }
}

refuse_call() {
  ! grep -qxF "$1" "$calls_file" || { printf 'FAIL: unexpected omp call: %s\n' "$1" >&2; exit 1; }
}

run_installer() {
  PATH="$fake_bin:$PATH" \
    EXCALIDRAW_MARKETPLACE_SOURCE="$repo_root" \
    FAKE_OMP_CALLS="$calls_file" \
    FAKE_OMP_STATE="$state_dir" \
    FAKE_OMP_ROOT="$1" \
    FAKE_OMP_MARKER="$marker" \
    "$repo_root/install.sh" --omp >/dev/null
}

# Fresh install: marketplace add, plugin install, renderer setup in root_a.
run_installer "$root_a"
assert_call "plugin marketplace add $repo_root"
assert_call 'plugin install excalidraw-diagram@excalidraw-diagram-skill --scope user'
refuse_call 'plugin upgrade excalidraw-diagram@excalidraw-diagram-skill --scope user'
refuse_call 'plugin marketplace update excalidraw-diagram-skill'
[ "$(cat "$marker")" = "$root_a" ] || { printf 'FAIL: renderer setup ran in the wrong root\n' >&2; exit 1; }
[ -f "$root_a/skills/excalidraw-diagram/SKILL.md" ] || { printf 'FAIL: plugin root missing skill\n' >&2; exit 1; }

# Update: add reports "already exists", so the catalog is refreshed and the
# plugin upgraded; renderer setup runs again in the new cache root.
run_installer "$root_b"
assert_call 'plugin marketplace update excalidraw-diagram-skill'
assert_call 'plugin upgrade excalidraw-diagram@excalidraw-diagram-skill --scope user'
[ "$(grep -cxF 'plugin install excalidraw-diagram@excalidraw-diagram-skill --scope user' "$calls_file")" -eq 1 ] \
  || { printf 'FAIL: update must not install again\n' >&2; exit 1; }
[ "$(cat "$marker")" = "$root_b" ] || { printf 'FAIL: renderer setup did not refresh the new root\n' >&2; exit 1; }

# A marketplace add failure that is not "already exists" must abort.
rm -f "$state_dir/added" "$state_dir/installed"
if FAKE_OMP_ADD_FAIL=1 \
  PATH="$fake_bin:$PATH" \
  EXCALIDRAW_MARKETPLACE_SOURCE="$repo_root" \
  FAKE_OMP_CALLS="$calls_file" \
  FAKE_OMP_STATE="$state_dir" \
  FAKE_OMP_ROOT="$root_a" \
  FAKE_OMP_MARKER="$marker" \
  "$repo_root/install.sh" --omp >/dev/null 2>&1; then
  printf 'FAIL: installer ignored a marketplace add failure\n' >&2
  exit 1
fi

printf 'PASS: omp install and update flows behave correctly\n'
