"""Wav2Lip — harici senkron servisine istemci (GPU sunucuda calisir)."""

from __future__ import annotations

import base64
import logging
import os
from pathlib import Path
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_root = Path(__file__).resolve().parent.parent
WAV2LIP_SERVICE_URL = (os.environ.get("WAV2LIP_SERVICE_URL") or "").rstrip("/")
WAV2LIP_FACE_PATH = os.environ.get(
    "WAV2LIP_FACE_PATH", str(_root / "frontend" / "public" / "video2.mp4")
)
WAV2LIP_FACE_URL = (os.environ.get("WAV2LIP_FACE_URL") or "").strip()
WAV2LIP_API_STYLE = (os.environ.get("WAV2LIP_API_STYLE") or "multipart").lower()


def wav2lip_enabled() -> bool:
    return bool(WAV2LIP_SERVICE_URL)


def _face_path() -> Path:
    p = Path(WAV2LIP_FACE_PATH)
    if not p.is_absolute():
        p = _root / p
    return p


async def sync_lips_to_video(
    audio_bytes: bytes,
    audio_filename: str = "speech.mp3",
    audio_mime: str = "audio/mpeg",
) -> bytes:
    """
    Ses + yuz videosu → dudak senkronlu MP4.
    Harici servis: POST {WAV2LIP_SERVICE_URL}/sync
    """
    if not WAV2LIP_SERVICE_URL:
        raise RuntimeError("WAV2LIP_SERVICE_URL ayarli degil")

    timeout = float(os.environ.get("WAV2LIP_TIMEOUT_SEC", "300"))

    if WAV2LIP_API_STYLE == "json":
        payload = {
            "audio_base64": base64.b64encode(audio_bytes).decode("ascii"),
            "audio_format": audio_filename.split(".")[-1] if "." in audio_filename else "mp3",
        }
        if WAV2LIP_FACE_URL:
            payload["face_url"] = WAV2LIP_FACE_URL
        else:
            face = _face_path()
            if face.is_file():
                payload["face_base64"] = base64.b64encode(face.read_bytes()).decode("ascii")
            else:
                raise FileNotFoundError(f"Yuz videosu bulunamadi: {face}")

        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(f"{WAV2LIP_SERVICE_URL}/sync/json", json=payload)
        if r.status_code >= 400:
            raise RuntimeError(f"Wav2Lip hata {r.status_code}: {r.text[:400]}")
        data = r.json()
        if data.get("video_base64"):
            return base64.b64decode(data["video_base64"])
        if isinstance(r.content, bytes) and len(r.content) > 100:
            return r.content
        raise RuntimeError("Wav2Lip yaniti gecersiz")

    # multipart (varsayilan)
    face = _face_path()
    if not face.is_file() and not WAV2LIP_FACE_URL:
        raise FileNotFoundError(
            f"Yuz videosu yok: {face}. WAV2LIP_FACE_PATH veya WAV2LIP_FACE_URL ayarlayin."
        )

    async with httpx.AsyncClient(timeout=timeout) as client:
        if WAV2LIP_FACE_URL:
            r = await client.post(
                f"{WAV2LIP_SERVICE_URL}/sync",
                data={"face_url": WAV2LIP_FACE_URL},
                files={"audio": (audio_filename, audio_bytes, audio_mime)},
            )
        else:
            with open(face, "rb") as face_f:
                files = {
                    "face": (face.name, face_f.read(), "video/mp4"),
                    "audio": (audio_filename, audio_bytes, audio_mime),
                }
                r = await client.post(f"{WAV2LIP_SERVICE_URL}/sync", files=files)

    if r.status_code >= 400:
        raise RuntimeError(f"Wav2Lip hata {r.status_code}: {r.text[:400]}")
    ctype = (r.headers.get("content-type") or "").lower()
    if "json" in ctype:
        data = r.json()
        if data.get("video_base64"):
            return base64.b64decode(data["video_base64"])
        raise RuntimeError(data.get("detail") or "Wav2Lip JSON yaniti gecersiz")
    return r.content
