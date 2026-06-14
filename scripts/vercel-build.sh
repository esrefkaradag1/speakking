#!/usr/bin/env bash
# Vercel build: React -> public/, FastAPI entrypoint pyproject.toml
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/frontend"
# Karsilama videosu (ana dizinden)
if [ -f "$ROOT/merhaba.mp4" ]; then
  cp "$ROOT/merhaba.mp4" public/merhaba.mp4
  echo "==> merhaba.mp4 public/ icine kopyalandi"
fi
# Avatar videolari public'ta olmali (yoksa onceki build'den kopyala)
for v in video2.mp4 video3.mp4; do
  if [ ! -f "public/$v" ] && [ -f "build/$v" ]; then
    cp "build/$v" "public/$v"
    echo "==> $v public/ icine kopyalandi (build'den)"
  fi
done
# Vercel sets CI=true — CRA treats eslint warnings as errors
export CI=false
export GENERATE_SOURCEMAP=false
# Canli: ayni origin /api (localhost build'e gomulmesin)
unset REACT_APP_AI_API_URL REACT_APP_BACKEND_URL
yarn build
cd "$ROOT"
rm -rf "$ROOT/public" "$ROOT/backend/static"
mkdir -p "$ROOT/public"
cp -a frontend/build/. "$ROOT/public/"
# Python function bundle icinde (CDN calismazsa FastAPI sunar)
cp -a frontend/build/. "$ROOT/backend/static/"
test -f "$ROOT/public/index.html" || { echo "ERROR: public/index.html yok"; exit 1; }
echo "==> static hazir: public/ + backend/static/ ($(du -sh "$ROOT/public" | cut -f1))"
