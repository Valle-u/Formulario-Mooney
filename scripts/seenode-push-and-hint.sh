#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REMOTE="${1:?remote url}"
git remote remove origin 2>/dev/null || true
git remote add origin "$REMOTE"
git push -u origin staging
git push -u origin main
echo "Pushed staging + main to $REMOTE"
echo "SHA=$(git rev-parse HEAD)"
