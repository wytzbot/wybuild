#!/usr/bin/env bash
set -Eeuo pipefail

# Vercel may invoke the build command with a working directory different from
# the script's directory. Resolve paths from this file, not from the caller.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

fail() {
  printf '\n[WyBuild Vercel build error] %s\n' "$1" >&2
  exit "${2:-1}"
}

# Find the actual Flutter app. This supports both a repo-root Flutter project
# and common nested layouts (for example ./wybuild/lib/main.dart).
APP_DIR=""
for candidate in \
  "$SCRIPT_DIR" \
  "$SCRIPT_DIR/wybuild" \
  "$SCRIPT_DIR/app" \
  "$SCRIPT_DIR/frontend" \
  "$SCRIPT_DIR/client"; do
  if [[ -f "$candidate/pubspec.yaml" && -f "$candidate/lib/main.dart" ]]; then
    APP_DIR="$candidate"
    break
  fi
done

if [[ -z "$APP_DIR" ]]; then
  while IFS= read -r -d '' entrypoint; do
    candidate="$(dirname "$(dirname "$entrypoint")")"
    if [[ -f "$candidate/pubspec.yaml" ]]; then
      APP_DIR="$candidate"
      break
    fi
  done < <(find "$SCRIPT_DIR" -mindepth 3 -maxdepth 7 -type f -path '*/lib/main.dart' \
    ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/.dart_tool/*' \
    ! -path '*/build/*' ! -path '*/.vercel/*' -print0 2>/dev/null)
fi

if [[ -z "$APP_DIR" ]]; then
  printf '[WyBuild] Build script directory: %s\n' "$SCRIPT_DIR" >&2
  printf '[WyBuild] Current working directory: %s\n' "$PWD" >&2
  printf '[WyBuild] Flutter manifests found:\n' >&2
  find "$SCRIPT_DIR" -maxdepth 6 -type f -name pubspec.yaml \
    ! -path '*/.git/*' ! -path '*/node_modules/*' ! -path '*/build/*' -print >&2 2>/dev/null || true
  fail 'Could not locate a Flutter app containing BOTH pubspec.yaml and lib/main.dart. Check that the Flutter source is committed to GitHub and that the Vercel Root Directory points to the WyBuild repository.' 2
fi

printf '[WyBuild] Flutter app directory: %s\n' "$APP_DIR"
cd "$APP_DIR"

# Reuse an installed Flutter SDK where possible; otherwise install the pinned
# version into Vercel's home directory.
if command -v flutter >/dev/null 2>&1; then
  FLUTTER_BIN="$(command -v flutter)"
elif [[ -x "${FLUTTER_ROOT:-}/bin/flutter" ]]; then
  FLUTTER_BIN="${FLUTTER_ROOT}/bin/flutter"
elif [[ -x "$HOME/flutter/bin/flutter" ]]; then
  FLUTTER_BIN="$HOME/flutter/bin/flutter"
else
  FLUTTER_VERSION="${FLUTTER_VERSION:-3.47.0}"
  git clone --depth 1 --branch "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$HOME/flutter" \
    || fail "Could not install Flutter $FLUTTER_VERSION. Check the Flutter version and network access." 3
  FLUTTER_BIN="$HOME/flutter/bin/flutter"
fi

"$FLUTTER_BIN" config --enable-web
"$FLUTTER_BIN" pub get
"$FLUTTER_BIN" build web --release --target=lib/main.dart --pwa-strategy=none

# Vercel's outputDirectory is relative to the repository root. If the Flutter
# app lives in a nested folder, copy its web output to the configured location.
OUTPUT_DIR="$SCRIPT_DIR/build/web"
APP_OUTPUT_DIR="$APP_DIR/build/web"
[[ -d "$APP_OUTPUT_DIR" ]] || fail "Flutter reported a successful build but the expected output directory is missing: $APP_OUTPUT_DIR" 4
if [[ "$APP_OUTPUT_DIR" != "$OUTPUT_DIR" ]]; then
  rm -rf "$OUTPUT_DIR"
  mkdir -p "$(dirname "$OUTPUT_DIR")"
  cp -a "$APP_OUTPUT_DIR" "$OUTPUT_DIR"
fi

[[ -s "$OUTPUT_DIR/index.html" ]] || fail "Flutter web output is missing index.html at $OUTPUT_DIR" 5
printf '[WyBuild] Flutter web build completed: %s\n' "$OUTPUT_DIR"
