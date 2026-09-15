#!/usr/bin/env python3
"""seed-practice-topics.sql dosyasini uzak Supabase Postgres'e uygular."""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / "supabase" / "seed-practice-topics.sql"

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / "backend" / ".env")
except ImportError:
    pass

HOST = os.environ.get("SUPABASE_DB_HOST", "speakking.edulim.com.tr")
PORT = os.environ.get("SUPABASE_DB_PORT", "5432")
PASSWORD = os.environ.get("SUPABASE_DB_PASSWORD", "")

if not PASSWORD:
    print("Hata: SUPABASE_DB_PASSWORD tanimli degil (backend/.env)")
    sys.exit(1)

if not SQL.is_file():
    print(f"Hata: {SQL} bulunamadi")
    sys.exit(1)

env = {**os.environ, "PGPASSWORD": PASSWORD}
cmd = ["psql", "-h", HOST, "-p", PORT, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-f", str(SQL)]

print(f"→ {SQL.name} uygulaniyor ({HOST}:{PORT})...")
result = subprocess.run(cmd, env=env)
sys.exit(result.returncode)
