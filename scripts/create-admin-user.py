#!/usr/bin/env python3
"""Self-hosted Supabase'te admin kullanicisi olusturur."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / "backend" / ".env")

URL = (os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL") or "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
EMAIL = os.environ.get("ADMIN_EMAIL", "admin@speakking.com")
PASSWORD = os.environ.get("ADMIN_PASSWORD", "admin123")
NAME = os.environ.get("ADMIN_NAME", "Admin")

if not URL or not SERVICE_KEY:
    print("Hata: backend/.env icinde SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli")
    sys.exit(1)

headers = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}

payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "email_confirm": True,
    "user_metadata": {"name": NAME},
}

print(f"→ Kullanici olusturuluyor: {EMAIL}")
with httpx.Client(timeout=30) as client:
    r = client.post(f"{URL}/auth/v1/admin/users", headers=headers, json=payload)

    if r.status_code == 422 and "already" in r.text.lower():
        print("   Kullanici zaten var, admin profili guncelleniyor...")
    elif r.status_code >= 400:
        print(f"Hata ({r.status_code}): {r.text}")
        sys.exit(1)
    else:
        print("   Auth kullanicisi olusturuldu.")

    from supabase import create_client

    sb = create_client(URL, SERVICE_KEY)
    sb.table("profiles").update({"is_admin": True, "name": NAME}).eq("email", EMAIL).execute()
    print(f"Tamam. Giris: {EMAIL} / {PASSWORD}")
