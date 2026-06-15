"""
AI proxy — Mongo yok. Veri Supabase'de; bu servis sadece chat / TTS / hint.
Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_JWT_SECRET, OPENROUTER_API_KEY
"""
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Body
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
import os
import re
import json
import random
import base64
import logging
import httpx
import jwt
from dotenv import load_dotenv
from pathlib import Path

_root = Path(__file__).resolve().parent.parent
load_dotenv(_root / "backend" / ".env")
load_dotenv(_root / "frontend" / ".env")
load_dotenv(_root / ".env")
load_dotenv(_root / ".env.local")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = (os.environ.get("SUPABASE_URL") or os.environ.get("REACT_APP_SUPABASE_URL") or "").rstrip("/")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET = os.environ.get("SUPABASE_JWT_SECRET", "")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TTS_VOICE_TR = os.environ.get("TTS_VOICE_TR", "tr-TR-EmelNeural")
TTS_VOICE_EN = os.environ.get("TTS_VOICE_EN", "en-US-AvaMultilingualNeural")
ELEVENLABS_DEFAULT_VOICE_ID = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
ELEVENLABS_MODEL = os.environ.get("ELEVENLABS_MODEL", "eleven_multilingual_v2")
FISH_API_KEY = (os.environ.get("FISH_API_KEY") or "").strip()
OPENAI_API_KEY = (os.environ.get("OPENAI_API_KEY") or "").strip()
TTS_PROVIDER = (os.environ.get("TTS_PROVIDER") or "auto").lower()
TTS_OPENAI_MODEL = os.environ.get("TTS_OPENAI_MODEL", "gpt-4o-mini-tts")
TTS_OPENAI_VOICE_TR = os.environ.get("TTS_OPENAI_VOICE_TR", "marin")
TTS_OPENAI_VOICE_EN = os.environ.get("TTS_OPENAI_VOICE_EN", "marin")
TTS_SPEECH_SPEED = float(os.environ.get("TTS_SPEECH_SPEED", "1.04"))
TTS_OPENAI_INSTRUCTIONS_TR = os.environ.get(
    "TTS_OPENAI_INSTRUCTIONS_TR",
    "Tamamen Türkçe konuş — İstanbul Türkçesi, doğal kadın sesi. Türkçe kelimeleri "
    "kusursuz Türkçe telaffuzla oku (ı, ğ, ş, ö, ü, ç). İngilizce aksanı kullanma. "
    "Yalnızca tırnak içindeki İngilizce kelimeleri kısa İngilizce telaffuzla söyle.",
)
TTS_OPENAI_INSTRUCTIONS_EN = os.environ.get(
    "TTS_OPENAI_INSTRUCTIONS_EN",
    "Young friendly female English tutor. Light, warm, feminine voice — not deep or male-sounding. "
    "Natural conversational pace, encouraging and clear.",
)
OPENROUTER_TTS_URL = "https://openrouter.ai/api/v1/audio/speech"
TTS_OPENROUTER_MODEL = os.environ.get(
    "TTS_OPENROUTER_MODEL", "openai/gpt-4o-mini-tts-2025-12-15"
)
DID_API_KEY = (
    os.environ.get("DID_API_KEY")
    or os.environ.get("REACT_APP_DID_API_KEY")
    or ""
).strip()
DID_API_BASE = "https://api.d-id.com"

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("SUPABASE_URL ve SUPABASE_SERVICE_ROLE_KEY gerekli")

from supabase import create_client  # noqa: E402

sb = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
security = HTTPBearer()

app = FastAPI(title="Speakking AI")
api_router = APIRouter(prefix="/api")


class ChatMessage(BaseModel):
    message: str
    session_id: str


class HintRequest(BaseModel):
    turkish_sentence: str
    level: str = "A1"


class VoiceSpeakIn(BaseModel):
    text: str
    lang: str = "en"
    voice: str = "nova"


def _user_id_from_token(token: str) -> str:
    """Supabase oturum JWT — ES256 (yeni) veya HS256 (legacy)."""
    try:
        resp = sb.auth.get_user(token)
        if resp and resp.user:
            return str(resp.user.id)
    except Exception as e:
        logger.warning("auth.get_user failed: %s", e)

    if SUPABASE_JWT_SECRET:
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") == "HS256":
                payload = jwt.decode(
                    token,
                    SUPABASE_JWT_SECRET,
                    algorithms=["HS256"],
                    options={"verify_aud": False},
                )
                return payload["sub"]
        except jwt.PyJWTError as e:
            logger.warning("HS256 decode failed: %s", e)

    raise HTTPException(401, detail="Gecersiz veya suresi dolmus oturum. Tekrar giris yapin.")


def _ensure_profile(uid: str, token: str) -> Dict:
    res = sb.table("profiles").select("*").eq("id", uid).execute()
    if res.data:
        return res.data[0]

    auth_user = sb.auth.get_user(token)
    if not auth_user or not auth_user.user:
        raise HTTPException(401, detail="Profil bulunamadi")

    u = auth_user.user
    meta = u.user_metadata or {}
    name = meta.get("name") or (u.email or "Kullanici").split("@")[0]
    row = (
        sb.table("profiles")
        .insert(
            {
                "id": uid,
                "email": u.email,
                "name": name,
                "level": "A1",
                "is_admin": u.email == "admin@speakking.com",
            }
        )
        .execute()
    )
    if row.data:
        return row.data[0]
    raise HTTPException(401, detail="Profil olusturulamadi")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    token = credentials.credentials
    uid = _user_id_from_token(token)
    return _ensure_profile(uid, token)


async def get_admin_user(user: Dict = Depends(get_current_user)) -> Dict:
    if not user.get("is_admin"):
        raise HTTPException(403, detail="Admin yetkisi gerekli")
    return user


def _parse_instruction_lines(text: str) -> List[str]:
    lines = []
    for raw in (text or "").split("\n"):
        line = re.sub(r"^[-•*]\s*", "", raw.strip())
        if len(line) >= 3:
            lines.append(line)
    return lines


def build_prompt_status_manifest(
    ai: dict, sentence_count: int = 0, doc_count: int = 0
) -> Dict[str, Any]:
    """Admin paneli: hangi prompt parçalarının derste işlendiğini göster."""
    blocks: List[Dict[str, Any]] = [
        {
            "id": "base",
            "type": "context",
            "label": "Speaky temel formatı",
            "status": "active",
            "applied": True,
            "detail": "Çeviri pratiği, [SAY_TR]/[SAY_EN], kelime paneli",
        }
    ]
    instructions: List[Dict[str, Any]] = []

    system_text = (ai.get("system_prompt") or "").strip()
    if system_text:
        blocks.append(
            {
                "id": "admin_system",
                "type": "context",
                "label": "Admin sistem talimatları",
                "status": "active",
                "applied": True,
                "detail": f"{len(_parse_instruction_lines(system_text))} satır modele eklenir",
                "preview": system_text[:160],
            }
        )
        for i, line in enumerate(_parse_instruction_lines(system_text)):
            instructions.append(
                {
                    "id": f"sys_{i}",
                    "text": line,
                    "source": "system",
                    "status": "applied",
                    "applied": True,
                }
            )
    else:
        blocks.append(
            {
                "id": "admin_system",
                "type": "context",
                "label": "Admin sistem talimatları",
                "status": "inactive",
                "applied": False,
                "detail": "Boş — derste kullanılmıyor",
            }
        )

    notes_text = (ai.get("custom_instructions") or "").strip()
    if notes_text:
        blocks.append(
            {
                "id": "teaching_notes",
                "type": "context",
                "label": "Öğretim notları",
                "status": "active",
                "applied": True,
                "detail": f"{len(_parse_instruction_lines(notes_text))} satır modele eklenir",
                "preview": notes_text[:160],
            }
        )
        for i, line in enumerate(_parse_instruction_lines(notes_text)):
            instructions.append(
                {
                    "id": f"note_{i}",
                    "text": line,
                    "source": "notes",
                    "status": "applied",
                    "applied": True,
                }
            )
    else:
        blocks.append(
            {
                "id": "teaching_notes",
                "type": "context",
                "label": "Öğretim notları",
                "status": "inactive",
                "applied": False,
                "detail": "Boş — derste kullanılmıyor",
            }
        )

    if ai.get("use_sentence_bank", True):
        blocks.append(
            {
                "id": "sentence_bank",
                "type": "context",
                "label": "Cümle bankası",
                "status": "active" if sentence_count > 0 else "warning",
                "applied": True,
                "detail": f"{sentence_count} cümle · derse max {ai.get('max_sentences_per_lesson', 10)}",
            }
        )
    else:
        blocks.append(
            {
                "id": "sentence_bank",
                "type": "context",
                "label": "Cümle bankası",
                "status": "inactive",
                "applied": False,
                "detail": "Kapalı",
            }
        )

    if ai.get("use_documents", True):
        blocks.append(
            {
                "id": "documents",
                "type": "context",
                "label": "Dokümanlar",
                "status": "active" if doc_count > 0 else "warning",
                "applied": doc_count > 0,
                "detail": f"{doc_count} doküman" if doc_count else "Açık ama doküman yok",
            }
        )
    else:
        blocks.append(
            {
                "id": "documents",
                "type": "context",
                "label": "Dokümanlar",
                "status": "inactive",
                "applied": False,
                "detail": "Kapalı",
            }
        )

    applied_count = sum(1 for b in blocks if b.get("applied"))
    return {
        "blocks": blocks,
        "instructions": instructions,
        "applied_count": applied_count,
        "instruction_count": len(instructions),
        "updated_at": ai.get("updated_at"),
        "will_process_on_next_lesson": True,
    }


def _is_english_line(line: str) -> bool:
    s = line.strip().strip("\"'")
    if not s or len(s) < 4:
        return False
    if re.search(r"[çğıöşüÇĞİÖŞÜ]", s):
        return False
    letters = re.findall(r"[a-zA-Z]", s)
    words = re.findall(r"[A-Za-z']+", s)
    return len(words) >= 2 and len(letters) >= 4 and len(letters) / max(len(s), 1) > 0.45


def _is_english_phrase(text: str) -> bool:
    s = text.strip().strip("\"'")
    if not s or len(s) < 2:
        return False
    if re.search(r"[çğıöşüÇĞİÖŞÜ]", s):
        return False
    if re.search(
        r"\b(her|sabah|işe|iş|giderim|kahvaltı|için|demeliyiz|güzel|doğru|ve|bir|bu|şu|çok)\b",
        s,
        re.I,
    ):
        return False
    letters = re.findall(r"[a-zA-Z]", s)
    words = re.findall(r"[A-Za-z']+", s)
    return len(words) >= 1 and len(letters) >= 3 and len(letters) / max(len(s), 1) > 0.45


def _expand_line_to_lang_segments(line: str) -> List[Dict[str, str]]:
    quote_re = re.compile(r"""['"]([^'"]+)['"]|["]([^""]+)["]""")
    parts: List[Dict[str, str]] = []
    last = 0
    has_quotes = False
    for m in quote_re.finditer(line):
        has_quotes = True
        before = line[last : m.start()].strip()
        quoted = (m.group(1) or m.group(2) or "").strip()
        if before:
            parts.append({"lang": "tr", "text": before})
        if quoted:
            lang = "en" if _is_english_phrase(quoted) else "tr"
            parts.append({"lang": lang, "text": quoted.strip("\"'")})
        last = m.end()
    after = line[last:].strip()
    if after:
        parts.append({"lang": "tr", "text": after})
    if not has_quotes:
        if _is_english_line(line):
            return [{"lang": "en", "text": line.strip("\"'")}]
        return [{"lang": "tr", "text": line}]
    merged: List[Dict[str, str]] = []
    for p in parts:
        t = (p.get("text") or "").strip()
        if not t:
            continue
        if (
            p.get("lang") == "tr"
            and len(t) <= 8
            and merged
            and merged[-1].get("lang") == "tr"
        ):
            merged[-1]["text"] = f"{merged[-1]['text']} {t}"
            continue
        merged.append({"lang": p["lang"], "text": t})
    return merged


def _split_sentences(text: str) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]
    out: List[str] = []
    for line in lines:
        parts = re.split(r"(?<=[.!?…])\s+", line)
        parts = [p.strip() for p in parts if p.strip()]
        if parts:
            out.extend(parts)
        else:
            out.append(line)
    return out or [text]


def _expand_sentence_segments(segments: List[Dict[str, str]]) -> List[Dict[str, str]]:
    out: List[Dict[str, str]] = []
    for seg in segments:
        for sent in _split_sentences(seg.get("text") or ""):
            out.append({"lang": seg["lang"], "text": sent})
    return out


def _infer_tts_segments_from_plain(clean: str) -> List[Dict[str, str]]:
    """Etiket yoksa satir satir TR/EN ayir; her cumle ayri TTS parcasi."""
    segments: List[Dict[str, str]] = []

    for block in re.split(r"\n\s*\n", clean):
        for line in block.split("\n"):
            line = line.strip()
            if not line:
                continue
            if _is_english_line(line):
                for sent in _split_sentences(line.strip("\"'")):
                    segments.append({"lang": "en", "text": sent})
            else:
                for piece in _expand_line_to_lang_segments(line):
                    segments.append(piece)

    if not segments and clean.strip():
        for sent in _split_sentences(clean.strip()):
            segments.append({"lang": "tr", "text": sent})
    return segments


def _parse_json_block(content: str) -> Optional[dict]:
    content = content.strip()
    if content.startswith("```"):
        content = re.sub(r"^```(?:json)?\s*", "", content)
        content = re.sub(r"\s*```$", "", content)
    try:
        return json.loads(content.strip())
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", content, re.DOTALL)
        if m:
            try:
                return json.loads(m.group(0))
            except json.JSONDecodeError:
                return None
    return None


def _normalize_vocab(d: dict) -> dict:
    word = (d.get("word") or d.get("english") or "").strip()
    meaning = (d.get("meaning") or d.get("translation_tr") or d.get("turkish") or "").strip()
    example = (d.get("example") or d.get("english") or word).strip()
    return {"word": word, "meaning": meaning, "example": example}


def _normalize_correction(d: dict) -> dict:
    return {
        "original": d.get("original", ""),
        "correction": d.get("correction") or d.get("corrected", ""),
        "explanation": d.get("explanation") or d.get("explanation_tr", ""),
        "turkish": d.get("turkish", ""),
    }


def _vocab_from_say_en(raw: str) -> List[dict]:
    """Model Ingilizce cumlesinden kelime kartlari."""
    stop = {
        "the", "a", "an", "and", "or", "but", "i", "you", "we", "they", "he", "she", "it",
        "is", "are", "was", "were", "be", "been", "am", "have", "has", "had", "do", "does",
        "did", "will", "would", "can", "could", "to", "in", "on", "at", "for", "of", "as",
        "by", "from", "with", "my", "your", "his", "her", "this", "that", "these", "those",
        "not", "no", "yes", "so", "if", "when", "before", "after", "then", "than", "very",
        "just", "also", "too", "up", "down", "out", "about", "into", "over", "every", "day",
        "going", "go", "get", "got",
    }
    out: List[dict] = []
    for m in re.finditer(r"\[SAY_EN\](.*?)\[/SAY_EN\]", raw, re.DOTALL | re.IGNORECASE):
        en = m.group(1).strip().strip('"')
        if not en or re.search(r"[çğıöşüÇĞİÖŞÜ]", en):
            continue
        rows = sb.table("sentences").select("*").eq("english", en).limit(1).execute().data
        if rows:
            r = rows[0]
            out.append(
                {
                    "word": r.get("english", en),
                    "meaning": r.get("turkish", ""),
                    "example": r.get("english", en),
                }
            )
            continue
        keywords: List[str] = []
        for t in re.findall(r"[A-Za-z']+", en):
            low = t.lower().strip("'")
            if len(low) >= 4 and low not in stop and low not in keywords:
                keywords.append(t if t[0].isupper() else low)
            if len(keywords) >= 2:
                break
        if not keywords:
            out.append({"word": en, "meaning": "ornek cumle", "example": en})
        else:
            for kw in keywords:
                out.append(
                    {
                        "word": kw,
                        "meaning": "ders kelimesi",
                        "example": en,
                    }
                )
    return out


def _scenario_word_build(scenario: dict) -> Optional[dict]:
    topics = scenario.get("topics") or []
    if isinstance(topics, str):
        try:
            topics = json.loads(topics)
        except json.JSONDecodeError:
            topics = []
    if isinstance(topics, dict) and topics.get("lesson_type") == "word_build":
        words = [str(w).strip() for w in (topics.get("words") or []) if str(w).strip()]
        if words:
            return {
                "words": words,
                "teacher_note": (topics.get("teacher_note") or "").strip(),
            }
    return None


def _fallback_vocabulary(level: str, scenario: dict, limit: int = 2) -> List[dict]:
    wb = _scenario_word_build(scenario)
    if wb:
        out = []
        for w in wb["words"][:limit]:
            out.append({"word": w, "meaning": "hedef kelime", "example": f"I use {w} in a sentence."})
        return out
    rows = sb.table("sentences").select("*").eq("level", level).limit(30).execute().data or []
    if not rows:
        rows = sb.table("sentences").select("*").limit(30).execute().data or []
    topics = scenario.get("topics") or []
    if isinstance(topics, str):
        try:
            topics = json.loads(topics)
        except json.JSONDecodeError:
            topics = [topics]
    topic_list = topics if isinstance(topics, list) else []
    if topic_list:
        filtered = [
            r
            for r in rows
            if any(str(t).lower() in (r.get("topic") or "").lower() for t in topic_list)
        ]
        if filtered:
            rows = filtered
    random.shuffle(rows)
    out = []
    for r in rows[:limit]:
        out.append(
            {
                "word": r.get("english", ""),
                "meaning": r.get("turkish", ""),
                "example": r.get("english", ""),
            }
        )
    return out


def enrich_vocabulary(
    vocabulary: List[dict],
    level: str,
    scenario: dict,
    display_text: str,
    raw: str = "",
) -> List[dict]:
    out: List[dict] = []
    seen: set = set()

    for v in _vocab_from_say_en(raw):
        n = _normalize_vocab(v)
        key = (n.get("word") or "").lower()
        if key and key not in seen:
            out.append(n)
            seen.add(key)

    for seg in _infer_tts_segments_from_plain(display_text or ""):
        if seg.get("lang") == "en":
            for v in _vocab_from_say_en(f"[SAY_EN]{seg['text']}[/SAY_EN]"):
                n = _normalize_vocab(v)
                key = (n.get("word") or "").lower()
                if key and key not in seen:
                    out.append(n)
                    seen.add(key)

    for v in vocabulary or []:
        n = _normalize_vocab(v) if isinstance(v, dict) else v
        key = (n.get("word") or n.get("meaning") or "").lower()
        if key and key not in seen:
            out.append(n)
            seen.add(key)

    for q in re.findall(r'"([^"]*[çğıöşüÇĞİÖŞÜ][^"]*)"', display_text or ""):
        rows = sb.table("sentences").select("*").eq("turkish", q).limit(1).execute().data
        if rows:
            n = _normalize_vocab(
                {
                    "word": rows[0].get("english", ""),
                    "meaning": rows[0].get("turkish", ""),
                    "example": rows[0].get("english", ""),
                }
            )
            key = n["word"].lower()
            if key and key not in seen:
                out.insert(0, n)
                seen.add(key)
            break

    if len(out) < 2:
        for item in _fallback_vocabulary(level, scenario, 4):
            key = (item.get("word") or "").lower()
            if key and key not in seen:
                out.append(item)
                seen.add(key)
            if len(out) >= 2:
                break

    return out[:3]


def parse_structured_response(raw_response: str) -> dict:
    return parse_speaky_response(raw_response)


def parse_speaky_response(raw: str) -> dict:
    """TTS: Turkce talimat + Ingilizce model cumle ayri seslendirilir."""
    corrections = []
    vocabulary = []
    work = raw

    cp = re.compile(r"\[CORRECTION\](.*?)\[/CORRECTION\]", re.DOTALL)
    for m in cp.finditer(work):
        d = _parse_json_block(m.group(1))
        if d:
            corrections.append(_normalize_correction(d))
    work = cp.sub("", work)

    vp = re.compile(r"\[VOCABULARY\](.*?)\[/VOCABULARY\]", re.DOTALL)
    for m in vp.finditer(work):
        d = _parse_json_block(m.group(1))
        if d:
            n = _normalize_vocab(d)
            if n.get("word") or n.get("meaning"):
                vocabulary.append(n)
    work = vp.sub("", work)

    segments: List[Dict[str, str]] = []
    display_parts: List[str] = []
    tag_re = re.compile(r"\[SAY_(TR|EN)\](.*?)\[/SAY_\1\]", re.DOTALL | re.IGNORECASE)

    for m in tag_re.finditer(work):
        lang = "tr" if m.group(1).upper() == "TR" else "en"
        text = m.group(2).strip()
        if text:
            segments.append({"lang": lang, "text": text})
            display_parts.append(text)

    clean = re.sub(r"\[/?SAY_(TR|EN)\]", "", work, flags=re.IGNORECASE).strip()
    clean = re.sub(r"\n{3,}", "\n\n", clean)

    if not segments and clean:
        segments = _infer_tts_segments_from_plain(clean)
        display_parts = [s["text"] for s in segments]

    display = "\n\n".join(display_parts) if display_parts else clean

    return {
        "text": display,
        "tts_segments": _expand_sentence_segments(segments),
        "corrections": corrections,
        "vocabulary": vocabulary,
    }


def build_training_prompt(session_level: str, scenario: dict, tone: str, user_name: str) -> str:
    ai = sb.table("ai_config").select("*").eq("id", "ai_training_config").single().execute().data or {}
    title = scenario.get("title", "conversation")
    desc = scenario.get("description", "")
    wb = _scenario_word_build(scenario)
    lesson_mode = ""
    if wb:
        words_line = ", ".join(wb["words"])
        note = wb.get("teacher_note") or ""
        lesson_mode = f"""
CUSTOM LESSON — WORD BUILDING (teacher-defined):
- Target English words/phrases (student must use them in spoken answers): {words_line}
- Do NOT only translate fixed Turkish sentences from the sentence bank for this lesson.
- Each turn: give a Turkish instruction in [SAY_TR] asking the student to build an English sentence using one or more target words.
  Example: 'Şu kelimeleri kullanarak İngilizce bir cümle kur: morning, coffee'
- Check the student's English includes the requested word(s); praise or correct briefly in Turkish.
- Rotate words across turns; vary sentence patterns (questions, negatives, past) when level allows.
- Teacher note: {note or "(none)"}
"""
    base = f"""You are Speaky — a Turkish-speaking English coach. The student is Turkish.
{lesson_mode}

LESSON FORMAT (every turn):
1) Give a Turkish sentence in quotes for the student to translate OUT LOUD into English.
2) Student speaks English (microphone). You judge right/wrong in Turkish.
3) If wrong or incomplete, briefly say so in Turkish, then read the correct English once.
4) Then give the NEXT Turkish sentence to translate.

OUTPUT FORMAT (required — system reads aloud using these tags):
- Turkish instructions + Turkish sentence to translate:
[SAY_TR]
Şu cümleyi İngilizceye çevir:

"Her sabah kahvaltı yaparım."
[/SAY_TR]

- After student answers — feedback in Turkish, optional correct English (ONLY this block is English voice):
[SAY_TR]
Güzel! Küçük bir hata var.
[/SAY_TR]
[SAY_EN]
I have breakfast every morning.
[/SAY_EN]
[SAY_TR]
Sıradaki cümle:

"Akşamları televizyon izlerim."
[/SAY_TR]

RULES:
- Do NOT write "'Turkish' means 'English'" in one paragraph.
- [SAY_TR] = Turkish ONLY. NEVER include any English words, letters, or phrases inside [SAY_TR], because the Turkish text-to-speech engine will mispronounce them.
- [SAY_EN] = ONLY the model English answer (one short sentence). Never put Turkish inside [SAY_EN].
- CRITICAL: Every English model/corrected sentence MUST be inside its own [SAY_EN]...[/SAY_EN] block.
- On FIRST message: welcome in Turkish, then first [SAY_TR] with one sentence from the topic.
- When student sends English: evaluate in Turkish in [SAY_TR], then [SAY_EN] if correction needed, then next [SAY_TR] challenge.
- Level {session_level}: simple sentences for A1/A2.
- Topic: {title} — {desc}. Tone: {tone}. Student: {user_name}.

VOCABULARY PANEL (required every response — 1 or 2 items, shown in UI, NOT in [SAY_TR]/[SAY_EN]):
[VOCABULARY]{{"word":"brush","meaning":"fırçalamak","example":"I brush my teeth every day."}}[/VOCABULARY]
[VOCABULARY]{{"word":"every day","meaning":"her gün","example":"I exercise every day."}}[/VOCABULARY]
- Pick useful English words/phrases from the current Turkish sentence or topic.
- ALWAYS include at least one [VOCABULARY] block per response.

CORRECTION (REQUIRED when student answer is wrong or incomplete):
[CORRECTION]{{"original":"student attempt","correction":"correct English","explanation":"kisa Turkce aciklama","turkish":"verilen Turkce cumle"}}[/CORRECTION]
- After any correction you MUST still give the NEXT Turkish challenge in [SAY_TR] in the same response.

MICROPHONE / INPUT:
- The app sends the student's spoken English as text. NEVER say you cannot hear the microphone.
- NEVER ask the student to type instead of speak. NEVER mention being an AI that cannot hear audio.
- Treat every English message as the student's spoken answer.

AFTER WRONG ANSWER:
- Brief Turkish feedback in [SAY_TR], [SAY_EN] with correct English, then immediately [SAY_TR] with the NEXT sentence to translate.
"""
    if ai.get("system_prompt"):
        base += f"\nADMIN:\n{ai['system_prompt']}\n"
    if ai.get("custom_instructions"):
        base += f"\nCUSTOM TEACHING NOTES:\n{ai['custom_instructions']}\n"
    if ai.get("use_sentence_bank", True) and not wb:
        q = sb.table("sentences").select("*").eq("level", session_level).limit(ai.get("max_sentences_per_lesson", 10))
        rows = q.execute().data or []
        if rows:
            base += "\nSENTENCE BANK:\n"
            for i, s in enumerate(rows, 1):
                base += f"{i}. TR: {s['turkish']} -> EN: {s['english']}\n"
    if ai.get("use_documents", True):
        docs = sb.table("documents").select("text_content").limit(5).execute().data or []
        texts = "\n".join(d.get("text_content", "")[:2000] for d in docs if d.get("text_content"))
        if texts:
            base += f"\nDOCUMENTS:\n{texts[:5000]}\n"
    return base


def _first_turn_welcome(session_level: str, scenario: dict, user_name: str) -> Optional[str]:
    """Ilk mesajda LLM beklemeden hizli karsilama (cumle bankasindan)."""
    title = scenario.get("title_tr") or scenario.get("title") or "ders"
    wb = _scenario_word_build(scenario)
    if wb:
        words = wb["words"]
        wstr = ", ".join(words)
        note = wb.get("teacher_note") or ""
        note_block = f"\n\n{note}" if note else ""
        first = words[0]
        return f"""[SAY_TR]
Merhaba {user_name}! {title} — kelime ile cümle kurma pratiğine başlıyoruz.

Şu kelimeleri kullanarak İngilizce bir cümle kur:

{wstr}{note_block}
[/SAY_TR]
[VOCABULARY]{{"word":"{first}","meaning":"hedef kelime","example":"Use {first} in your sentence."}}[/VOCABULARY]"""
    rows = (
        sb.table("sentences")
        .select("turkish,english")
        .eq("level", session_level)
        .limit(30)
        .execute()
        .data
        or []
    )
    if not rows:
        return None
    pick = random.choice(rows)
    tr = (pick.get("turkish") or "").strip()
    if not tr:
        return None
    return f"""[SAY_TR]
Merhaba {user_name}! {title} konusunda pratige basliyoruz.

Şu cümleyi İngilizceye çevir:

"{tr}"
[/SAY_TR]
[VOCABULARY]{{"word":"practice","meaning":"pratik","example":"Let's practice English."}}[/VOCABULARY]"""


async def openrouter_chat(messages: list) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "HTTP-Referer": os.environ.get("APP_URL", "https://speakking.edulim.net"),
                "X-Title": "Speakking",
            },
            json={"model": "google/gemini-2.5-flash", "messages": messages},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


def _strip_tts_markup(text: str) -> str:
    t = text or ""
    t = re.sub(r"\[CORRECTION\].*?\[/CORRECTION\]", "", t, flags=re.DOTALL | re.IGNORECASE)
    t = re.sub(r"\[VOCABULARY\].*?\[/VOCABULARY\]", "", t, flags=re.DOTALL | re.IGNORECASE)
    t = re.sub(
        r"\[SAY_(?:TR|EN)\](.*?)\[/SAY_(?:TR|EN)\]",
        r"\1",
        t,
        flags=re.DOTALL | re.IGNORECASE,
    )
    t = re.sub(r"\[/?SAY_(TR|EN)\]", "", t, flags=re.IGNORECASE)
    t = re.sub(r"<[^>]+>", "", t)
    t = re.sub(r"\*+", "", t)
    return t.strip()


def _english_for_tts(text: str) -> str:
    """Sesli okuma icin yalnizca Ingilizce cumleleri sec."""
    text = re.sub(r"\[CORRECTION\].*?\[/CORRECTION\]", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r"\[VOCABULARY\].*?\[/VOCABULARY\]", "", text, flags=re.DOTALL | re.IGNORECASE)
    text = text.replace("*", "").strip()
    quoted = re.findall(r'"([^"]+)"', text)
    en_quotes = [q for q in quoted if not re.search(r"[çğıöşüÇĞİÖŞÜ]", q)]
    if en_quotes:
        return " ".join(en_quotes)
    parts = re.split(r"(?<=[.!?])\s+", text)
    en_parts = []
    for s in parts:
        if re.search(r"means\s+['\"]|demek|çevir|anlamına|harika!?\s*ben", s, re.I):
            continue
        tr = len(re.findall(r"[çğıöşüÇĞİÖŞÜ]", s))
        latin = len(re.findall(r"[a-zA-Z]", s))
        if latin >= 8 and tr <= 1:
            en_parts.append(s)
    return " ".join(en_parts) if en_parts else text


def _tts_voice_for_lang(lang: Optional[str]) -> str:
    if lang == "tr":
        return TTS_VOICE_TR
    if lang == "en":
        return TTS_VOICE_EN
    return TTS_VOICE_EN


def _tts_prosody(speed: float, lang: str) -> tuple[str, str]:
    """Edge yedek: hafif hizli, dogal ton."""
    if speed < 1.0:
        return ("+0%", "+0Hz")
    if speed > 1.0:
        return ("+10%", "+0Hz")
    return ("+6%", "+0Hz")


def _spoken_text_for_tts(text: str, lang: str) -> str:
    """Ekrandaki cumleyi okut; SSML/etiket kalmasin."""
    t = _strip_tts_markup(text)
    if not t:
        return ""
    if lang == "tr":
        return t
    if not re.search(r"[çğıöşüÇĞİÖŞÜ]", t):
        return t.strip().strip("\"'").strip()
    return (_english_for_tts(t) or t).strip()


async def synthesize_elevenlabs(
    text: str, api_key: str, voice_id: str, lang: str = "en"
) -> bytes:
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {"xi-api-key": api_key, "Content-Type": "application/json"}
    data = {
        "text": text,
        "model_id": ELEVENLABS_MODEL,
        "voice_settings": {
            "stability": 0.42,
            "similarity_boost": 0.78,
            "style": 0.18,
            "use_speaker_boost": True,
        },
    }
    if lang == "tr":
        data["language_code"] = "tr"
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=data, timeout=45.0)
        resp.raise_for_status()
        return resp.content


async def synthesize_fish_speech(text: str, api_key: str, voice_id: str = "") -> bytes:
    url = "https://api.fish.audio/v1/tts"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    data = {"text": text, "format": "mp3"}
    if voice_id:
        data["reference_id"] = voice_id
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=data, timeout=30.0)
        resp.raise_for_status()
        return resp.content


def _effective_tts_speed(admin_speed: float) -> float:
    """Normal konusma hizi — yavas degil, insansi tempo."""
    base = admin_speed if admin_speed > 0 else 1.0
    if base < 1.0:
        return max(0.98, base * 1.08)
    return min(1.12, base * TTS_SPEECH_SPEED)


def _speech_api_payload(text: str, speed: float, lang: str, model: str) -> Dict[str, Any]:
    voice = TTS_OPENAI_VOICE_TR if lang == "tr" else TTS_OPENAI_VOICE_EN
    instructions = TTS_OPENAI_INSTRUCTIONS_TR if lang == "tr" else TTS_OPENAI_INSTRUCTIONS_EN
    payload: Dict[str, Any] = {
        "model": model,
        "input": text,
        "voice": voice,
        "speed": _effective_tts_speed(speed),
        "response_format": "mp3",
    }
    if lang == "tr":
        payload["language_code"] = "tr"
    if "gpt-4o-mini-tts" in model and instructions:
        payload["instructions"] = instructions
    return payload


async def _post_speech_api(
    url: str, api_key: str, payload: Dict[str, Any], extra_headers: Optional[Dict[str, str]] = None
) -> bytes:
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if extra_headers:
        headers.update(extra_headers)
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=payload, timeout=60.0)
        resp.raise_for_status()
        return resp.content


async def synthesize_openrouter_tts(text: str, speed: float, lang: str) -> bytes:
    """OpenRouter TTS — https://openrouter.ai/docs/guides/overview/multimodal/tts"""
    payload = _speech_api_payload(text, speed, lang, TTS_OPENROUTER_MODEL)
    return await _post_speech_api(
        OPENROUTER_TTS_URL,
        OPENROUTER_API_KEY,
        payload,
        extra_headers={
            "HTTP-Referer": os.environ.get("OPENROUTER_HTTP_REFERER", "https://speakking.edulim.net"),
            "X-Title": "Speakking",
        },
    )


async def synthesize_openai_tts(text: str, speed: float, lang: str, api_key: str) -> bytes:
    """OpenAI Audio API — https://developers.openai.com/api/docs/guides/text-to-speech"""
    payload = _speech_api_payload(text, speed, lang, TTS_OPENAI_MODEL)
    return await _post_speech_api("https://api.openai.com/v1/audio/speech", api_key, payload)


async def _try_openrouter_tts(spoken: str, speed: float, lang: str) -> Optional[tuple[bytes, str]]:
    if not OPENROUTER_API_KEY:
        return None
    try:
        audio = await synthesize_openrouter_tts(spoken, speed, lang)
        if audio:
            logger.info("TTS OpenRouter %s: %s", lang, spoken[:80])
            return audio, "openrouter"
    except Exception as e:
        logger.warning("OpenRouter TTS failed: %s", e)
    return None


async def _try_openai_tts(spoken: str, speed: float, lang: str) -> Optional[tuple[bytes, str]]:
    if not OPENAI_API_KEY:
        return None
    try:
        audio = await synthesize_openai_tts(spoken, speed, lang, OPENAI_API_KEY)
        if audio:
            logger.info("TTS OpenAI %s: %s", lang, spoken[:80])
            return audio, "openai"
    except Exception as e:
        logger.warning("OpenAI TTS failed: %s", e)
    return None


def _elevenlabs_enabled(settings: Dict) -> bool:
    env_on = os.environ.get("TTS_USE_ELEVENLABS", "true").lower() in ("1", "true", "yes", "on")
    admin_on = settings.get("use_elevenlabs") in (True, "true", "t", 1, "1")
    return env_on or admin_on


def _cartesia_enabled(settings: Dict) -> bool:
    # Always enabled as requested by user
    return True


async def synthesize_cartesia_tts(text: str, api_key: str, voice_id: str, lang: str) -> Optional[bytes]:
    url = "https://api.cartesia.ai/tts/bytes"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Cartesia-Version": "2024-06-10",
        "Content-Type": "application/json"
    }
    model_id = "sonic-3.5"
    payload = {
        "model_id": model_id,
        "transcript": text,
        "voice": {
            "mode": "id",
            "id": voice_id
        },
        "output_format": {
            "container": "mp3",
            "bit_rate": 64000,
            "sample_rate": 44100
        }
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.post(url, headers=headers, json=payload)
            r.raise_for_status()
            return r.content
    except httpx.HTTPStatusError as e:
        logger.error("Cartesia HTTP error: %s - Body: %s", e, r.text)
        return None
    except Exception as e:
        logger.error("Cartesia general error: %s", e)
        return None


async def synthesize_speech(
    text: str, speed: float = 1.0, lang: str = "en", settings: Optional[Dict] = None
) -> tuple[bytes, str]:
    settings = settings or {}
    lang = lang if lang in ("en", "tr") else "en"
    spoken = _spoken_text_for_tts(text, lang)
    if not spoken:
        raise ValueError("Empty TTS text")

    eleven_key = (settings.get("elevenlabs_api_key") or "").strip() or (
        os.environ.get("ELEVENLABS_API_KEY") or ""
    ).strip()
    voice_id = (
        (settings.get("elevenlabs_voice_id") or "").strip() or ELEVENLABS_DEFAULT_VOICE_ID
    )
    
    cartesia_key = "sk_car_rnTaKhDMpvj3UYLd8szTPB"
    cartesia_voice_id = "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4"

    if cartesia_key and _cartesia_enabled(settings):
        try:
            audio = await synthesize_cartesia_tts(spoken, cartesia_key, cartesia_voice_id, lang)
            if audio:
                logger.info("TTS Cartesia %s: %s", lang, spoken[:80])
                return audio, "cartesia"
        except Exception as e:
            logger.warning("Cartesia TTS failed: %s", e)

    prefer_edge_tr = os.environ.get("TTS_PREFER_EDGE_TR", "false").lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if lang == "tr" and prefer_edge_tr:
        try:
            audio = await synthesize_edge_tts(spoken, speed, lang=lang)
            if audio:
                logger.info("TTS Edge (TR oncelikli) %s", spoken[:80])
                return audio, "edge"
        except Exception as e:
            logger.warning("Edge TR failed, fallback: %s", e)

    if TTS_PROVIDER == "openrouter":
        hit = await _try_openrouter_tts(spoken, speed, lang)
        if hit:
            return hit

    if TTS_PROVIDER == "openai":
        hit = await _try_openai_tts(spoken, speed, lang)
        if hit:
            return hit
        hit = await _try_openrouter_tts(spoken, speed, lang)
        if hit:
            return hit

    if TTS_PROVIDER in ("fish", "auto") and FISH_API_KEY:
        try:
            audio = await synthesize_fish_speech(
                spoken, FISH_API_KEY, os.environ.get("FISH_VOICE_ID", "")
            )
            if audio:
                logger.info("TTS Fish %s: %s", lang, spoken[:80])
                return audio, "fish"
        except Exception as e:
            logger.warning("Fish TTS failed: %s", e)

    if TTS_PROVIDER in ("elevenlabs", "auto") and eleven_key and _elevenlabs_enabled(settings):
        try:
            audio = await synthesize_elevenlabs(spoken, eleven_key, voice_id, lang=lang)
            if audio:
                logger.info("TTS ElevenLabs %s: %s", lang, spoken[:80])
                return audio, "elevenlabs"
        except Exception as e:
            logger.warning("ElevenLabs failed: %s", e)

    if TTS_PROVIDER in ("openrouter", "openai", "auto"):
        hit = await _try_openrouter_tts(spoken, speed, lang)
        if hit:
            return hit
        hit = await _try_openai_tts(spoken, speed, lang)
        if hit:
            return hit

    audio = await synthesize_edge_tts(spoken, speed, lang=lang)
    logger.info("TTS Edge %s: %s", lang, spoken[:80])
    return audio, "edge"


async def synthesize_edge_tts(text: str, speed: float = 1.0, lang: Optional[str] = None) -> bytes:
    """Duz metin — SSML kullanma (edge-tts artik okumuyor, 'speak version' der)."""
    import edge_tts

    spoken = _spoken_text_for_tts(text, lang or "en") or text.strip()
    voice = _tts_voice_for_lang(lang)
    rate, pitch = _tts_prosody(speed, lang or "en")
    audio = b""
    comm = edge_tts.Communicate(spoken, voice, rate=rate, pitch=pitch)
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
    return audio


class PasswordUpdate(BaseModel):
    password: str

@api_router.put("/admin/users/{user_id}/password")
async def update_user_password(user_id: str, payload: PasswordUpdate, user: Dict = Depends(get_admin_user)):
    try:
        # update_user_by_id takes attributes dict
        res = sb.auth.admin.update_user_by_id(user_id, attributes={"password": payload.password})
        return {"message": "Sifre guncellendi", "success": True}
    except Exception as e:
        logger.error(f"Sifre degistirme hatasi: {e}")
        raise HTTPException(500, detail=f"Sifre güncellenemedi: {str(e)}")

@api_router.get("/admin/prompt-status")
async def admin_prompt_status(
    sentence_count: int = 0,
    doc_count: int = 0,
    _admin: Dict = Depends(get_admin_user),
):
    """Kayıtlı AI ayarlarının derste hangi parçalarının işlendiğini döner."""
    ai = (
        sb.table("ai_config")
        .select("*")
        .eq("id", "ai_training_config")
        .single()
        .execute()
        .data
        or {}
    )
    manifest = build_prompt_status_manifest(ai, sentence_count, doc_count)
    manifest["config_hash"] = hash(
        (ai.get("system_prompt") or "")
        + (ai.get("custom_instructions") or "")
        + str(ai.get("use_sentence_bank"))
        + str(ai.get("use_documents"))
    )
    return manifest


class Wav2LipSyncIn(BaseModel):
    audio_base64: str
    format: str = "mp3"


@api_router.get("/avatar/wav2lip/health")
async def wav2lip_health(user: Dict = Depends(get_current_user)):
    from wav2lip_client import WAV2LIP_SERVICE_URL, wav2lip_enabled

    if not wav2lip_enabled():
        return {"enabled": False, "detail": "WAV2LIP_SERVICE_URL ayarli degil"}
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{WAV2LIP_SERVICE_URL}/health")
        svc = r.json() if r.status_code == 200 else {}
        return {
            "enabled": True,
            "service_ok": r.status_code == 200 and svc.get("ok") is True,
            "mode": svc.get("mode"),
            "service": svc if r.status_code == 200 else r.text[:200],
        }
    except Exception as e:
        return {"enabled": True, "service_ok": False, "error": str(e)}


@api_router.post("/avatar/wav2lip/sync")
async def wav2lip_sync_endpoint(body: Wav2LipSyncIn, user: Dict = Depends(get_current_user)):
    from wav2lip_client import sync_lips_to_video, wav2lip_enabled

    if not wav2lip_enabled():
        raise HTTPException(
            503,
            detail="Wav2Lip kapali. backend/.env icinde WAV2LIP_SERVICE_URL ayarlayin.",
        )
    try:
        audio_bytes = base64.b64decode(body.audio_base64)
    except Exception:
        raise HTTPException(400, detail="audio_base64 gecersiz")
    ext = (body.format or "mp3").lower().replace(".", "")
    mime = "audio/wav" if ext == "wav" else "audio/mpeg"
    try:
        video_bytes = await sync_lips_to_video(audio_bytes, f"speech.{ext}", mime)
    except FileNotFoundError as e:
        raise HTTPException(503, detail=str(e))
    except RuntimeError as e:
        logger.error("Wav2Lip sync: %s", e)
        raise HTTPException(502, detail=str(e))
    return {
        "success": True,
        "format": "mp4",
        "video_base64": base64.b64encode(video_bytes).decode("ascii"),
    }


@api_router.get("/health")
async def health():
    return {"status": "ok", "service": "Speakking AI", "database": "supabase"}


@api_router.post("/chat")
async def chat_with_ai(chat_data: ChatMessage, user: Dict = Depends(get_current_user)):
    if user.get("used_minutes_today", 0) >= user.get("daily_limit_minutes", 30):
        raise HTTPException(403, detail="Daily limit reached")

    sess = (
        sb.table("lesson_sessions")
        .select("*")
        .eq("id", chat_data.session_id)
        .eq("user_id", user["id"])
        .single()
        .execute()
    )
    if not sess.data:
        raise HTTPException(404, detail="Session not found")
    session = sess.data

    scenario = (
        sb.table("scenarios").select("*").eq("id", session["scenario_id"]).single().execute().data
        or {}
    )
    settings = (
        sb.table("admin_settings").select("*").eq("id", "global_settings").single().execute().data
        or {}
    )
    tone = settings.get("teacher_tone", "friendly")

    system_message = build_training_prompt(session.get("level", "A1"), scenario, tone, user.get("name", "User"))
    messages = [{"role": "system", "content": system_message}]
    for entry in session.get("transcript") or []:
        if entry.get("user"):
            messages.append({"role": "user", "content": entry["user"]})
        if entry.get("ai_raw"):
            messages.append({"role": "assistant", "content": entry["ai_raw"]})
        elif entry.get("ai"):
            messages.append({"role": "assistant", "content": entry["ai"]})
    messages.append({"role": "user", "content": chat_data.message})

    transcript = session.get("transcript") or []
    msg_lower = (chat_data.message or "").lower()
    is_greeting = any(
        k in msg_lower
        for k in ("merhaba", "hazir", "hazır", "basla", "başla", "pratik", "hello", "hi")
    )
    raw = None
    if not transcript and is_greeting:
        raw = _first_turn_welcome(
            session.get("level", "A1"), scenario, user.get("name", "User")
        )
    if not raw:
        raw = await openrouter_chat(messages)
    parsed = parse_structured_response(raw)
    parsed["vocabulary"] = enrich_vocabulary(
        parsed.get("vocabulary") or [],
        session.get("level", "A1"),
        scenario,
        parsed.get("text") or "",
        raw,
    )
    parsed["corrections"] = [
        _normalize_correction(c) if isinstance(c, dict) else c
        for c in parsed.get("corrections") or []
    ]

    transcript = list(transcript)
    transcript.append(
        {
            "user": chat_data.message,
            "ai": parsed["text"],
            "ai_raw": raw,
            "corrections": parsed["corrections"],
            "vocabulary": parsed["vocabulary"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    corrections = list(session.get("corrections") or [])
    corrections.extend(parsed["corrections"])

    sb.table("lesson_sessions").update(
        {"transcript": transcript, "corrections": corrections}
    ).eq("id", chat_data.session_id).execute()

    return {
        "response": parsed["text"],
        "tts_segments": parsed.get("tts_segments") or [],
        "session_id": chat_data.session_id,
        "corrections": parsed["corrections"],
        "vocabulary": parsed["vocabulary"],
    }


@api_router.post("/hint/translate")
async def hint_translate(request: HintRequest, user: Dict = Depends(get_current_user)):
    prompt = f"Translate to English (level {request.level}): {request.turkish_sentence}"
    raw = await openrouter_chat(
        [
            {
                "role": "system",
                "content": "Translate Turkish to English. Reply with only the English translation.",
            },
            {"role": "user", "content": prompt},
        ]
    )
    return {"translation": raw.strip().strip('"').strip("'"), "success": True}


@api_router.post("/voice/speak")
async def voice_speak(
    user: Dict = Depends(get_current_user),
    body: Optional[VoiceSpeakIn] = Body(default=None),
    text: Optional[str] = None,
    voice: str = "nova",
    lang: str = "en",
):
    raw_text = ((body.text if body else None) or text or "").strip()
    if not raw_text:
        raise HTTPException(400, detail="text is required")
    lang_code = (body.lang if body else lang) if body else lang
    if lang_code not in ("en", "tr"):
        lang_code = "en"

    settings = (
        sb.table("admin_settings")
        .select("speech_speed, elevenlabs_api_key, elevenlabs_voice_id, use_elevenlabs, cartesia_api_key, cartesia_voice_id, use_cartesia")
        .eq("id", "global_settings")
        .single()
        .execute()
        .data
        or {}
    )
    speed_map = {"slow": 0.98, "normal": 1.0, "fast": 1.1}
    speed = speed_map.get(settings.get("speech_speed", "normal"), 1.0)
    try:
        audio, provider = await synthesize_speech(raw_text, speed, lang=lang_code, settings=settings)
        spoken = _spoken_text_for_tts(raw_text, lang_code)
        return {
            "audio": base64.b64encode(audio).decode(),
            "format": "mp3",
            "success": True,
            "provider": provider,
            "spoken_text": spoken,
        }
    except Exception as e:
        logger.error("TTS: %s", e)
        raise HTTPException(500, detail="TTS failed")


def _did_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    if not DID_API_KEY:
        raise HTTPException(503, detail="D-ID API key not configured")
    if ":" in DID_API_KEY or "@" in DID_API_KEY:
        token = base64.b64encode(DID_API_KEY.encode()).decode()
    else:
        token = DID_API_KEY
    headers = {"Authorization": f"Basic {token}", "Content-Type": "application/json"}
    eleven = (os.environ.get("ELEVENLABS_API_KEY") or "").strip()
    if eleven:
        headers["x-api-key-external"] = json.dumps({"elevenlabs": eleven})
    if extra:
        headers.update(extra)
    return headers


class DidStreamCreate(BaseModel):
    source_url: str


@api_router.post("/avatar/stream")
async def did_create_stream(body: DidStreamCreate, user: Dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{DID_API_BASE}/talks/streams",
            headers=_did_headers(),
            json={"source_url": body.source_url},
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, detail=r.text)
    return r.json()


@api_router.post("/avatar/stream/{stream_id}/sdp")
async def did_stream_sdp(stream_id: str, payload: Dict[str, Any] = Body(...), user: Dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{DID_API_BASE}/talks/streams/{stream_id}/sdp",
            headers=_did_headers(),
            json=payload,
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, detail=r.text)
    return r.json() if r.content else {"ok": True}


@api_router.post("/avatar/stream/{stream_id}/ice")
async def did_stream_ice(stream_id: str, payload: Dict[str, Any] = Body(...), user: Dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{DID_API_BASE}/talks/streams/{stream_id}/ice",
            headers=_did_headers(),
            json=payload,
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, detail=r.text)
    return r.json() if r.content else {"ok": True}


@api_router.post("/avatar/stream/{stream_id}/speak")
async def did_stream_speak(stream_id: str, payload: Dict[str, Any] = Body(...), user: Dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=120.0) as client:
        r = await client.post(
            f"{DID_API_BASE}/talks/streams/{stream_id}",
            headers=_did_headers(),
            json=payload,
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, detail=r.text)
    return r.json() if r.content else {"ok": True}


@api_router.delete("/avatar/stream/{stream_id}")
async def did_stream_delete(stream_id: str, payload: Dict[str, Any] = Body(default={}), user: Dict = Depends(get_current_user)):
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.delete(
            f"{DID_API_BASE}/talks/streams/{stream_id}",
            headers=_did_headers(),
            json=payload or None,
        )
    if r.status_code >= 400:
        raise HTTPException(r.status_code, detail=r.text)
    return {"ok": True}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Vercel FastAPI: CDN sometimes does not serve public/ — serve React build from disk
_PUBLIC_CANDIDATES = (
    _root / "public",
    _root / "backend" / "static",
    _root / "frontend" / "build",
)
PUBLIC_DIR = next((p for p in _PUBLIC_CANDIDATES if p.is_dir() and (p / "index.html").is_file()), None)


def _public_file(rel: str):
    if PUBLIC_DIR is None:
        return None
    rel = (rel or "").lstrip("/")
    if not rel:
        return PUBLIC_DIR / "index.html"
    target = (PUBLIC_DIR / rel).resolve()
    root = PUBLIC_DIR.resolve()
    if not str(target).startswith(str(root)):
        return None
    return target if target.is_file() else None


if PUBLIC_DIR is not None:
    _static = PUBLIC_DIR / "static"
    if _static.is_dir():
        app.mount("/static", StaticFiles(directory=_static), name="static")

    @app.get("/", include_in_schema=False)
    async def spa_root():
        return FileResponse(PUBLIC_DIR / "index.html")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        if full_path.startswith("api") or full_path.startswith("static/"):
            raise HTTPException(404, detail="Not Found")
        found = _public_file(full_path)
        if found:
            return FileResponse(found)
        return FileResponse(PUBLIC_DIR / "index.html")
else:
    logger.warning("public/ veya frontend/build yok — sadece /api calisir")
