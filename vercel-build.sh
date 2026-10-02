#!/usr/bin/env bash
set -euo pipefail
if ! command -v flutter >/dev/null 2>&1; then
  FLUTTER_VERSION="${FLUTTER_VERSION:-3.47.0}"
  git clone --depth 1 --branch "$FLUTTER_VERSION" https://github.com/flutter/flutter.git "$HOME/flutter"
  export PATH="$HOME/flutter/bin:$PATH"
fi
flutter config --enable-web
flutter pub get
flutter build web --release --pwa-strategy=none
