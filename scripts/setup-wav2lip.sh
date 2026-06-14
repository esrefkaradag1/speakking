#!/usr/bin/env bash
# Wav2Lip kurulumu (opsiyonel gercek model) + servis bagimliliklari
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PORT="${WAV2LIP_PORT:-5050}"
VENV="$ROOT/backend/venv"
REPO="$ROOT/external/Wav2Lip"

echo "→ ffmpeg kontrol..."
command -v ffmpeg >/dev/null || { echo "ffmpeg gerekli: brew install ffmpeg"; exit 1; }

echo "→ Python bagimliliklari (wav2lip servis)..."
if [[ -d "$VENV" ]]; then
  source "$VENV/bin/activate"
else
  python3 -m venv "$VENV"
  source "$VENV/bin/activate"
fi
pip install -q fastapi uvicorn httpx python-multipart

if [[ "${SKIP_WAV2LIP_MODEL:-}" == "1" ]]; then
  echo "→ Model atlandi (SKIP_WAV2LIP_MODEL=1). ffmpeg modu kullanilacak."
  exit 0
fi

echo "→ Wav2Lip repo..."
mkdir -p "$ROOT/external"
if [[ ! -d "$REPO/.git" ]]; then
  git clone --depth 1 https://github.com/Rudrabha/Wav2Lip.git "$REPO"
fi

mkdir -p "$REPO/checkpoints"
CKPT="$REPO/checkpoints/wav2lip_gan.pth"
if [[ ! -f "$CKPT" ]]; then
  echo "→ Checkpoint indiriliyor (~150MB, bir kez)..."
  curl -L --fail -o "$CKPT" \
    "https://github.com/Rudrabha/Wav2Lip/releases/download/v0.1/wav2lip_gan.pth" \
    || curl -L --fail -o "$CKPT" \
    "https://iiitaphyd-my.sharepoint.com/personal/radrabha_m_research_iiit_ac_in/_layouts/15/download.aspx?shareid=EdjI7bZlgApMqsVoEUUXpLsBxqXbn5z9VTvBngOtWbbJEQ&e=eTNedQ" \
    || echo "⚠ Checkpoint indirilemedi — ffmpeg modu ile devam edilir."
fi

if [[ -f "$CKPT" ]]; then
  echo "→ Wav2Lip Python paketleri (uzun surebilir)..."
  pip install -q torch torchvision torchaudio 2>/dev/null || pip install -q torch torchvision
  pip install -q opencv-python-headless librosa numpy scipy tqdm numba 2>/dev/null || true
  if [[ -f "$REPO/requirements.txt" ]]; then
    pip install -q -r "$REPO/requirements.txt" 2>/dev/null || true
  fi
fi

FACE="$ROOT/frontend/public/video2.mp4"
echo ""
echo "✓ Kurulum tamam"
echo "  Yuz videosu: $FACE"
echo "  Servis:      bash scripts/start-wav2lip.sh"
echo "  backend/.env WAV2LIP_SERVICE_URL=http://localhost:$PORT"
