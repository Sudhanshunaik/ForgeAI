#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"

mkdir -p "$UNIT_DIR"
cp "$REPO_DIR/systemd/hermes-headroom.service" "$UNIT_DIR/hermes-headroom.service"

echo "Reloading systemd user daemon..."
systemctl --user daemon-reload

echo "Enabling and starting hermes-headroom.service..."
systemctl --user enable --now hermes-headroom.service

echo "Service status:"
systemctl --user status hermes-headroom.service --no-pager
