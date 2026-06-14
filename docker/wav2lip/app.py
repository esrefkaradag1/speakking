"""
Wav2Lip mikroservis — gercek Wav2Lip veya ffmpeg yedek (Mac/lokal gelistirme).

Port: 5050 (Mac'te 5000 AirPlay tarafindan kullanilir)
"""

from __future__ import annotations

import base64
import os
import shutil
import subprocess
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel

app = FastAPI(title="Wav2Lip Sync Service")

_ROOT = Path(__file__).resolve().parents[2]
WAV2LIP_REPO = Path(os.environ.get("WAV2LIP_REPO", str(_ROOT / "external" / "Wav2Lip")))
INFERENCE = WAV2LIP_REPO / "inference.py"
CHECKPOINT = Path(
    os.environ.get("WAV2LIP_CHECKPOINT", str(WAV2LIP_REPO / "checkpoints" / "wav2lip_gan.pth"))
)
DEFAULT_FACE = os.environ.get(
    "WAV2LIP_FACE_VIDEO",
    str(_ROOT / "frontend" / "public" / "video2.mp4"),
)
FFMPEG = os.environ.get("FFMPEG", "ffmpeg")
FORCE_FFMPEG = os.environ.get("WAV2LIP_FORCE_FFMPEG", "").lower() in ("1", "true", "yes")


def _wav2lip_ready() -> bool:
    return INFERENCE.is_file() and CHECKPOINT.is_file() and not FORCE_FFMPEG


def _ffmpeg_ready() -> bool:
    try:
        subprocess.run([FFMPEG, "-version"], capture_output=True, check=True, timeout=10)
        return True
    except Exception:
        return False


def _to_wav(audio_path: Path, work: Path) -> Path:
    if audio_path.suffix.lower() == ".wav":
        return audio_path
    wav_path = work / "audio_norm.wav"
    proc = subprocess.run(
        [FFMPEG, "-y", "-i", str(audio_path), "-ar", "16000", "-ac", "1", str(wav_path)],
        capture_output=True,
        text=True,
        timeout=120,
    )
    if proc.returncode != 0 or not wav_path.is_file():
        raise HTTPException(500, detail=f"Ses donusturulemedi: {proc.stderr[-400:]}")
    return wav_path


def _run_ffmpeg_mux(face_path: Path, audio_path: Path, out_path: Path) -> None:
    if not _ffmpeg_ready():
        raise HTTPException(503, detail="ffmpeg bulunamadi")
    wav_path = _to_wav(audio_path, out_path.parent)
    cmd = [
        FFMPEG,
        "-y",
        "-i",
        str(face_path),
        "-i",
        str(wav_path),
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-async",
        "1",
        "-vsync",
        "cfr",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(out_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if proc.returncode != 0 or not out_path.is_file():
        raise HTTPException(
            500, detail=f"ffmpeg mux basarisiz: {proc.stderr[-600:] or proc.stdout[-300:]}"
        )


def _run_inference(face_path: Path, audio_path: Path, out_path: Path) -> None:
    if not INFERENCE.is_file():
        raise HTTPException(503, detail=f"Wav2Lip inference.py yok: {INFERENCE}")
    if not CHECKPOINT.is_file():
        raise HTTPException(503, detail=f"Checkpoint yok: {CHECKPOINT}")

    wav_path = _to_wav(audio_path, out_path.parent)
    python = os.environ.get("WAV2LIP_PYTHON", "python3")
    cmd = [
        python,
        str(INFERENCE),
        "--checkpoint_path",
        str(CHECKPOINT),
        "--face",
        str(face_path),
        "--audio",
        str(wav_path),
        "--outfile",
        str(out_path),
        "--resize_factor",
        os.environ.get("WAV2LIP_RESIZE_FACTOR", "2"),
    ]
    pads = os.environ.get("WAV2LIP_PADS", "0 10 4 0")
    cmd.extend(["--pads", *pads.split()])

    proc = subprocess.run(
        cmd, capture_output=True, text=True, timeout=900, cwd=str(WAV2LIP_REPO)
    )
    if proc.returncode != 0:
        raise HTTPException(
            500,
            detail=f"Wav2Lip inference basarisiz: {proc.stderr[-800:] or proc.stdout[-400:]}",
        )
    if not out_path.is_file():
        raise HTTPException(500, detail="Cikti videosu olusturulamadi")


def _sync_video(face_path: Path, audio_path: Path, out_path: Path) -> str:
    """Returns mode used: wav2lip | ffmpeg"""
    if _wav2lip_ready():
        try:
            _run_inference(face_path, audio_path, out_path)
            return "wav2lip"
        except HTTPException:
            if not _ffmpeg_ready():
                raise
        except Exception as e:
            if not _ffmpeg_ready():
                raise HTTPException(500, detail=str(e)) from e
    _run_ffmpeg_mux(face_path, audio_path, out_path)
    return "ffmpeg"


async def _resolve_face(
    work: Path, face: UploadFile | None, face_url: str | None, face_base64: str | None
) -> Path:
    if face and face.filename:
        face_path = work / "face.mp4"
        face_path.write_bytes(await face.read())
        return face_path
    if face_url:
        import httpx

        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.get(face_url)
            if r.status_code >= 400:
                raise HTTPException(400, detail="face_url indirilemedi")
            face_path = work / "face.mp4"
            face_path.write_bytes(r.content)
            return face_path
    if face_base64:
        face_path = work / "face.mp4"
        face_path.write_bytes(base64.b64decode(face_base64))
        return face_path
    if DEFAULT_FACE and Path(DEFAULT_FACE).is_file():
        return Path(DEFAULT_FACE)
    raise HTTPException(
        400,
        detail=f"face gerekli. WAV2LIP_FACE_VIDEO yok: {DEFAULT_FACE}",
    )


@app.get("/health")
def health():
    mode = "wav2lip" if _wav2lip_ready() else ("ffmpeg" if _ffmpeg_ready() else "none")
    ok = mode != "none"
    return {
        "ok": ok,
        "mode": mode,
        "wav2lip_ready": _wav2lip_ready(),
        "ffmpeg_ready": _ffmpeg_ready(),
        "face": DEFAULT_FACE,
        "face_exists": Path(DEFAULT_FACE).is_file() if DEFAULT_FACE else False,
        "inference": str(INFERENCE),
        "checkpoint": str(CHECKPOINT),
    }


@app.post("/sync")
async def sync_multipart(
    audio: UploadFile = File(...),
    face: UploadFile | None = File(None),
    face_url: str | None = Form(None),
):
    work = Path(tempfile.mkdtemp(prefix="w2l_"))
    try:
        ext = Path(audio.filename or "audio.mp3").suffix or ".mp3"
        audio_path = work / f"audio_{uuid.uuid4().hex[:8]}{ext}"
        audio_path.write_bytes(await audio.read())
        face_path = await _resolve_face(work, face, face_url, None)
        out_path = work / "out.mp4"
        _sync_video(face_path, audio_path, out_path)
        return Response(content=out_path.read_bytes(), media_type="video/mp4")
    finally:
        shutil.rmtree(work, ignore_errors=True)


class SyncJsonBody(BaseModel):
    audio_base64: str
    audio_format: str = "mp3"
    face_url: str | None = None
    face_base64: str | None = None


@app.post("/sync/json")
async def sync_json(body: SyncJsonBody):
    work = Path(tempfile.mkdtemp(prefix="w2l_"))
    try:
        ext = body.audio_format if body.audio_format in ("wav", "mp3", "m4a") else "mp3"
        audio_path = work / f"audio.{ext}"
        audio_path.write_bytes(base64.b64decode(body.audio_base64))
        face_path = await _resolve_face(work, None, body.face_url, body.face_base64)
        out_path = work / "out.mp4"
        mode = _sync_video(face_path, audio_path, out_path)
        return {
            "video_base64": base64.b64encode(out_path.read_bytes()).decode("ascii"),
            "mode": mode,
        }
    finally:
        shutil.rmtree(work, ignore_errors=True)
