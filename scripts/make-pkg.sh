#!/bin/sh
# Wrap the .app that `pnpm tauri build` produced into a macOS .pkg installer.
#
# A .dmg relies on the user dragging the app into Applications; a .pkg walks
# them through an installer like the Windows .exe does and puts the app in
# /Applications itself. Run after `pnpm tauri build` on a Mac:
#   sh scripts/make-pkg.sh
# Output: src-tauri/target/release/bundle/pkg/ForgeBoard IDE_<version>.pkg
#
# Unsigned, like the .dmg: first launch needs right-click → Open until an
# Apple Developer ID is set up (then add `--sign "Developer ID Installer: …"`).
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').version")"
IDENTIFIER="$(node -p "require('$ROOT/src-tauri/tauri.conf.json').identifier")"
APP="$ROOT/src-tauri/target/release/bundle/macos/ForgeBoard IDE.app"
if [ ! -d "$APP" ]; then
  APP="$ROOT/src-tauri/target/universal-apple-darwin/release/bundle/macos/ForgeBoard IDE.app"
fi
if [ ! -d "$APP" ]; then
  echo "No built app found — run 'pnpm tauri build' first." >&2
  exit 1
fi
OUT_DIR="$ROOT/src-tauri/target/release/bundle/pkg"
OUT="$OUT_DIR/ForgeBoard IDE_${VERSION}.pkg"
mkdir -p "$OUT_DIR"
pkgbuild \
  --component "$APP" \
  --install-location /Applications \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  "$OUT"
echo "Installer ready: $OUT"
