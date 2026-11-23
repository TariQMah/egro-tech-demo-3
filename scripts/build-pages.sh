#!/usr/bin/env bash
# Builds the single-file demo and copies it to docs/ for GitHub Pages ("Deploy from a branch", main, /docs).
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
mkdir -p docs
cp dist/index.html docs/index.html
touch docs/.nojekyll
echo "docs/index.html updated ($(du -h docs/index.html | cut -f1)). Commit and push to publish."
