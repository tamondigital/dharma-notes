#!/bin/sh
# Copy the shared tiedy theme's CSS (../tamondigital.github.io/theme/) into src/styles/theme/. The copies are committed
# so a build never needs the theme repo; edit the theme there. chrome.js is not used: Base.astro keeps its own inline
# behaviour because reader.js owns the 目次 highlight.
set -e
SRC="$(dirname "$0")/../../tamondigital.github.io/theme"
DIR="$(dirname "$0")/.."
mkdir -p "$DIR/src/styles/theme"
cp "$SRC/tokens.css" "$SRC/chrome.css" "$DIR/src/styles/theme/"
echo "theme synced from $SRC"
