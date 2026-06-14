#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${WAV2LIP_PORT:-5050}"

lsof -ti:"$PORT" 2>/dev/null | xargs kill -9 2>/dev/null || true

export WAV2LIP_REPO="${WAV2LIP_REPO:-$ROOT/external/Wav2Lip}"
export WAV2LIP_FACE_VIDEO="${WAV2LIP_FACE_VIDEO:-$ROOT/frontend/public/video2.mp4}"
export WAV2LIP_FORCE_FFMPEG="${WAV2LIP_FORCE_FFMPEG:-1}"

cd "$ROOT"
if [[ -d backend/venv ]]; then source backend/venv/bin/activate; fi

echo "→ Wav2Lip servisi http://0.0.0.0:$PORT (ffmpeg=${WAV2LIP_FORCE_FFMPEG})"
exec python -m uvicorn app:app --host 0.0.0.0 --port "$PORT" --app-dir docker/wav2lip
