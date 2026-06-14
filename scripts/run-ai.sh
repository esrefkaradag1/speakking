#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
exec python -m uvicorn ai_server:app --host 0.0.0.0 --port 8001 --reload
