#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

APP="build/t3notch.app"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp Info.plist "$APP/Contents/Info.plist"

swiftc -O -swift-version 5 \
  -target arm64-apple-macos14.0 \
  -o "$APP/Contents/MacOS/t3notch" \
  Sources/*.swift

/usr/bin/python3 scripts/make_sounds.py "$APP/Contents/Resources"
cp LICENSE "$APP/Contents/Resources/THIRD-PARTY-LICENSE.txt"

codesign --force --sign - "$APP"
echo "built $APP"
