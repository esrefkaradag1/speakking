#!/usr/bin/env bash
# Tek sunucu — build + uvicorn (Vercel gerekmez)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -f backend/.env ] && [ -f .env ]; then
  cp .env backend/.env
fi
if [ ! -f backend/.env ]; then
  echo "backend/.env veya .env gerekli. Ornek: cp .env.example .env"
  exit 1
fi

echo "==> Frontend build (ayni origin /api)..."
cd frontend
REACT_APP_BACKEND_URL= yarn build
cd "$ROOT"

export FRONTEND_BUILD_PATH="$ROOT/frontend/build"
echo "==> Backend http://0.0.0.0:8000 (UI + /api)"
cd backend
exec python -m uvicorn server:app --host 0.0.0.0 --port 8000
