#!/usr/bin/env bash
set -euo pipefail

REPO="BenjaminG/ralph-tui-github-tracker"
PLUGIN_DIR="${HOME}/.config/ralph-tui/plugins/trackers"
PLUGIN_FILE="${PLUGIN_DIR}/github.js"

# --- Uninstall ---
if [[ "${1:-}" == "--uninstall" ]]; then
  if [[ -f "$PLUGIN_FILE" ]]; then
    rm "$PLUGIN_FILE"
    echo "Uninstalled github tracker plugin."
  else
    echo "Plugin not found at $PLUGIN_FILE — nothing to remove."
  fi
  exit 0
fi

# --- Prereq check ---
if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required." >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "Warning: gh CLI not found. The plugin requires it at runtime."
  echo "  Install: https://cli.github.com/"
fi

# --- Download latest release ---
DOWNLOAD_URL=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep -o '"browser_download_url":\s*"[^"]*index\.js"' \
  | head -1 \
  | cut -d'"' -f4)

if [[ -z "$DOWNLOAD_URL" ]]; then
  echo "Error: could not find index.js in latest release." >&2
  echo "  Check: https://github.com/${REPO}/releases" >&2
  exit 1
fi

# --- Install ---
mkdir -p "$PLUGIN_DIR"
curl -fsSL "$DOWNLOAD_URL" -o "$PLUGIN_FILE"
echo "Installed github tracker plugin to $PLUGIN_FILE"
