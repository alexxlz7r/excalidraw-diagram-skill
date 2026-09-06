#!/usr/bin/env bash
# Install or update the Excalidraw Diagram plugin for Codex, Claude Code, or both.
set -euo pipefail

readonly REPOSITORY="alexxlz7r/excalidraw-diagram-skill"
readonly MARKETPLACE="excalidraw-diagram-skill"
readonly CODEX_PLUGIN="excalidraw-diagram-skill@${MARKETPLACE}"
readonly CLAUDE_PLUGIN="excalidraw-diagram@${MARKETPLACE}"

install_codex=0
install_claude=0

usage() {
  cat <<'EOF'
Install or update the Excalidraw Diagram plugin.

Usage:
  install.sh                 choose interactively
  install.sh --codex         install/update for Codex
  install.sh --claude        install/update for Claude Code
  install.sh --all           install/update for both

The flags can also be combined. When piping the installer, pass flags after
`bash -s --`, for example:

  curl -fsSL https://raw.githubusercontent.com/alexxlz7r/excalidraw-diagram-skill/main/install.sh | bash -s -- --all
EOF
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command not found: $1"
}

while (($#)); do
  case "$1" in
    --codex) install_codex=1 ;;
    --claude) install_claude=1 ;;
    --all) install_codex=1; install_claude=1 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1 (run with --help)" ;;
  esac
  shift
done

choose_targets() {
  local answer=""
  [ -r /dev/tty ] || fail "No interactive terminal. Re-run with --codex, --claude, or --all."

  printf '\nInstall or update Excalidraw Diagram for:\n'
  printf '  1) Codex\n'
  printf '  2) Claude Code\n'
  printf '  3) Both\n'
  printf 'Choose [1-3]: '
  read -r answer </dev/tty || fail "Could not read the selection."

  case "$answer" in
    1) install_codex=1 ;;
    2) install_claude=1 ;;
    3) install_codex=1; install_claude=1 ;;
    *) fail "Expected 1, 2, or 3." ;;
  esac
}

json_has_marketplace() {
  local expected="$1"
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      const rows = Array.isArray(value) ? value : (value.marketplaces || []);
      process.exit(rows.some(row => row.name === process.argv[1]) ? 0 : 1);
    });
  ' "$expected"
}

json_marketplace_kind() {
  local expected="$1"
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      const rows = Array.isArray(value) ? value : (value.marketplaces || []);
      const match = rows.find(row => row.name === process.argv[1]);
      if (!match) process.exit(1);
      process.stdout.write(match.marketplaceSource?.sourceType || match.source || "unknown");
    });
  ' "$expected"
}

json_has_claude_plugin() {
  local expected="$1"
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const rows = JSON.parse(input);
      process.exit(rows.some(row => row.id === process.argv[1] && row.scope === "user") ? 0 : 1);
    });
  ' "$expected"
}

json_codex_install_path() {
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const value = JSON.parse(input);
      if (!value.installedPath) process.exit(1);
      process.stdout.write(value.installedPath);
    });
  '
}

json_claude_install_path() {
  local expected="$1"
  node -e '
    let input = "";
    process.stdin.on("data", chunk => input += chunk);
    process.stdin.on("end", () => {
      const rows = JSON.parse(input);
      const match = rows.find(row => row.id === process.argv[1] && row.scope === "user");
      if (!match || !match.installPath) process.exit(1);
      process.stdout.write(match.installPath);
    });
  ' "$expected"
}

setup_renderer() {
  local plugin_root="$1"
  local setup="$plugin_root/skills/excalidraw-diagram/scripts/setup_renderer.sh"
  [ -x "$setup" ] || fail "Renderer setup script not found in installed plugin: $setup"
  "$setup"
}

archive_legacy_skill() {
  local legacy="$1"
  local backup=""
  local stamp=""

  [ -e "$legacy" ] || [ -L "$legacy" ] || return 0
  stamp="$(date -u +%Y%m%d-%H%M%S)"
  backup="${legacy}.disabled-${stamp}"
  [ ! -e "$backup" ] && [ ! -L "$backup" ] || backup="${backup}-$$"
  mv "$legacy" "$backup"
  printf '  Archived legacy skill: %s\n' "$backup"
}

install_for_codex() {
  local cache_parent="${CODEX_HOME:-$HOME/.codex}/plugins/cache/${MARKETPLACE}/excalidraw-diagram-skill"
  local install_json=""
  local marketplaces_json=""
  local marketplace_kind=""
  local previous_root=""
  local previous_roots=()
  local plugin_root=""
  local source="${EXCALIDRAW_MARKETPLACE_SOURCE:-$REPOSITORY}"

  require_command codex
  printf '\n[Codex] Configuring marketplace...\n'
  marketplaces_json="$(codex plugin marketplace list --json)"
  if printf '%s' "$marketplaces_json" | json_has_marketplace "$MARKETPLACE"; then
    marketplace_kind="$(printf '%s' "$marketplaces_json" | json_marketplace_kind "$MARKETPLACE")"
    if [ "$marketplace_kind" = "git" ]; then
      codex plugin marketplace upgrade "$MARKETPLACE" >/dev/null
    else
      printf '  Using existing %s marketplace.\n' "$marketplace_kind"
    fi
  else
    codex plugin marketplace add "$source" >/dev/null
  fi

  if [ -d "$cache_parent" ]; then
    for previous_root in "$cache_parent"/*; do
      if [ -e "$previous_root" ] || [ -L "$previous_root" ]; then
        previous_roots+=("$previous_root")
      fi
    done
  fi

  printf '[Codex] Installing or refreshing plugin...\n'
  install_json="$(codex plugin add "$CODEX_PLUGIN" --json)"
  plugin_root="$(printf '%s' "$install_json" | json_codex_install_path)" \
    || fail "Codex installed the plugin but did not report its path."

  printf '[Codex] Setting up renderer...\n'
  setup_renderer "$plugin_root"

  for previous_root in "${previous_roots[@]}"; do
    if [ "$previous_root" != "$plugin_root" ] \
      && [ ! -e "$previous_root" ] && [ ! -L "$previous_root" ]; then
      mkdir -p "$(dirname "$previous_root")"
      ln -s "$plugin_root" "$previous_root"
      printf '  Preserved cache path for open Codex threads: %s\n' "$(basename "$previous_root")"
    fi
  done

  archive_legacy_skill "${CODEX_HOME:-$HOME/.codex}/skills/excalidraw-diagram"
  printf '[Codex] Ready. Start a new Codex thread to load the updated plugin.\n'
}

install_for_claude() {
  local marketplaces_json=""
  local marketplace_kind=""
  local plugin_root=""
  local source="${EXCALIDRAW_MARKETPLACE_SOURCE:-$REPOSITORY}"

  require_command claude
  printf '\n[Claude Code] Configuring marketplace...\n'
  marketplaces_json="$(claude plugin marketplace list --json)"
  if printf '%s' "$marketplaces_json" | json_has_marketplace "$MARKETPLACE"; then
    marketplace_kind="$(printf '%s' "$marketplaces_json" | json_marketplace_kind "$MARKETPLACE")"
    if [ "$marketplace_kind" = "github" ]; then
      claude plugin marketplace update "$MARKETPLACE" >/dev/null
    else
      printf '  Using existing %s marketplace.\n' "$marketplace_kind"
    fi
  else
    claude plugin marketplace add "$source" >/dev/null
  fi

  printf '[Claude Code] Installing or updating plugin...\n'
  if claude plugin list --json | json_has_claude_plugin "$CLAUDE_PLUGIN"; then
    claude plugin update "$CLAUDE_PLUGIN" --scope user --yes
  else
    claude plugin install "$CLAUDE_PLUGIN" --scope user --yes
  fi

  plugin_root="$(claude plugin list --json | json_claude_install_path "$CLAUDE_PLUGIN")" \
    || fail "Claude installed the plugin but did not report its path."

  printf '[Claude Code] Setting up renderer...\n'
  setup_renderer "$plugin_root"
  archive_legacy_skill "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills/excalidraw-diagram"
  printf '[Claude Code] Ready. Run /reload-plugins or start a new session.\n'
}

if ((install_codex == 0 && install_claude == 0)); then
  choose_targets
fi

require_command node
require_command npm

((install_codex == 1)) && install_for_codex
((install_claude == 1)) && install_for_claude

printf '\nExcalidraw Diagram installation complete.\n'
