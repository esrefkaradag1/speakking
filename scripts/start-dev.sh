#!/usr/bin/env bash
# Temiz gelistirme baslangici: frontend + (opsiyonel) AI proxy
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

WAV2LIP_PORT="${WAV2LIP_PORT:-5050}"
echo "→ Portlar temizleniyor (3000, 8001, $WAV2LIP_PORT)..."
lsof -ti:3000,8001,"$WAV2LIP_PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

# backend/.env yukle
set -a
[[ -f backend/.env ]] && source backend/.env
[[ -f frontend/.env.development ]] && source frontend/.env.development
set +a

WAV2LIP_PID=""
if [[ -n "${WAV2LIP_SERVICE_URL:-}" ]] || [[ "${REACT_APP_AVATAR_PROVIDER:-}" == "wav2lip" ]]; then
  echo "→ Wav2Lip servisi (http://localhost:${WAV2LIP_PORT})..."
  (
    export WAV2LIP_PORT
    export WAV2LIP_FORCE_FFMPEG="${WAV2LIP_FORCE_FFMPEG:-1}"
    bash "$ROOT/scripts/start-wav2lip.sh"
  ) &
  WAV2LIP_PID=$!
  sleep 1
fi

AI_PID=""
if [[ -n "${SUPABASE_SERVICE_ROLE_KEY:-}" && -n "${SUPABASE_JWT_SECRET:-}" ]]; then
  echo "→ AI sunucusu baslatiliyor (http://localhost:8001)..."
  (
    cd "$ROOT/backend"
    if [[ -d venv ]]; then source venv/bin/activate; elif [[ -d .venv ]]; then source .venv/bin/activate; fi
    exec python -m uvicorn ai_server:app --host 0.0.0.0 --port 8001 --reload
  ) &
  AI_PID=$!
  sleep 2
else
  echo "⚠ AI atlandi: backend/.env icinde SUPABASE_SERVICE_ROLE_KEY ve SUPABASE_JWT_SECRET doldurun."
  echo "  (Giris ve senaryolar Supabase ile calisir; ders sohbeti/TTS icin AI gerekir.)"
fi

echo "→ Frontend baslatiliyor (http://localhost:3000)..."
cd "$ROOT/frontend"
export BROWSER=none
exec yarn start
