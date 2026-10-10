#!/bin/sh
# Wrap the .app that `pnpm tauri build` produced into a macOS .pkg installer.
#
# A .dmg relies on the user dragging the app into Applications; a .pkg walks
# them through an installer like the Windows .exe does and puts the app in
# /Applications itself. Run after `pnpm tauri build` on a Mac:
#   sh scripts/make-pkg.sh
# Output: src-tauri/target/pkg/ForgeBoard IDE_<version>.pkg
#
# The .app is found under any cargo target dir (plain `target/release`, or
# `target/<triple>/release` when built with --target, as CI does).
#
# Unsigned, like the .dmg: first launch needs right-click → Open until an
# Apple Developer ID is set up (then add `--sign "Developer ID Installer: …"`).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').version")"
IDENTIFIER="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').identifier")"
APP="$(find "$ROOT/src-tauri/target" -maxdepth 5 -type d -name "ForgeBoard IDE.app" -path "*/release/bundle/macos/*" 2>/dev/null | head -1)"
if [ -z "$APP" ]; then
  echo "No built app found — run 'pnpm tauri build' first." >&2
  exit 1
fi
OUT_DIR="$ROOT/src-tauri/target/pkg"
OUT="$OUT_DIR/ForgeBoard IDE_${VERSION}.pkg"
mkdir -p "$OUT_DIR"
rm -f "$OUT_DIR"/*.pkg
pkgbuild \
  --component "$APP" \
  --install-location /Applications \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  "$OUT"
echo "Installer ready: $OUT"
