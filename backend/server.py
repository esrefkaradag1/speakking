from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File, Query, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response, FileResponse
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import base64
import requests
import re
import json
import httpx
from emergentintegrations.llm.chat import LlmChat, UserMessage
from emergentintegrations.llm.openai import OpenAISpeechToText, OpenAITextToSpeech

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'speakking_secret')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

# Emergent LLM Key
EMERGENT_LLM_KEY = os.environ.get('EMERGENT_LLM_KEY', '')

# ElevenLabs Config
ELEVENLABS_API_KEY = os.environ.get('ELEVENLABS_API_KEY', '')
ELEVENLABS_VOICE_ID = os.environ.get('ELEVENLABS_VOICE_ID', '21m00Tcm4TlvDq8ikWAM')

# Resemble AI Chatterbox Config
USE_CHATTERBOX = os.environ.get('USE_CHATTERBOX', 'False').lower() in ('true', '1', 'yes')
chatterbox_model = None

# Fish Speech Config
FISH_API_KEY = os.environ.get('FISH_API_KEY', '')
FISH_VOICE_ID = os.environ.get('FISH_VOICE_ID', '')  # Optional: specific cloned voice model ID
USE_FISH_SPEECH = os.environ.get('USE_FISH_SPEECH', 'False').lower() in ('true', '1', 'yes')

# TTS mode: "fast" (Edge-TTS first, ~1-2s) or "premium" (Fish/Chatterbox first, slower but higher quality)
TTS_MODE = os.environ.get('TTS_MODE', 'fast').lower()

# Object Storage Config
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
APP_NAME = "speakking"
storage_key = None

def init_storage():
    """Initialize object storage - call once at startup"""
    global storage_key
    if storage_key:
        return storage_key
    try:
        resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_LLM_KEY}, timeout=30)
        resp.raise_for_status()
        storage_key = resp.json()["storage_key"]
        logger.info("Object storage initialized successfully")
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    """Upload file to object storage"""
    key = init_storage()
    if not key:
        raise Exception("Storage not initialized")
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str) -> tuple:
    """Download file from object storage"""
    key = init_storage()
    if not key:
        raise Exception("Storage not initialized")
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")
security = HTTPBearer()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class AdminUserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    level: str = "A1"
    is_admin: bool = False
    daily_limit_minutes: Optional[int] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    email: str
    name: str
    level: str = "A1"
    daily_limit_minutes: int = 3000
    used_minutes_today: float = 0
    is_admin: bool = False
    created_at: str

class Scenario(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    level: str  # A1, A2, B1, B2, C1, C2
    title: str
    title_tr: str
    description: str
    description_tr: str
    topics: List[str] = []
    is_active: bool = True
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class ScenarioCreate(BaseModel):
    level: str
    title: str
    title_tr: str
    description: str
    description_tr: str
    topics: List[str] = []

class LessonSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    scenario_id: str
    level: str
    started_at: str
    ended_at: Optional[str] = None
    duration_minutes: float = 0
    corrections: List[Dict[str, Any]] = []
    vocabulary_hints: List[Dict[str, str]] = []
    transcript: List[Dict[str, str]] = []

class ChatMessage(BaseModel):
    message: str
    session_id: str

class CorrectionCard(BaseModel):
    original: str
    correction: str
    explanation: str
    translation: str

class VocabularyHint(BaseModel):
    word: str
    meaning: str

class AdminSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "global_settings"
    daily_limit_minutes: int = 3000
    teacher_tone: str = "friendly"  # friendly, formal, encouraging
    speech_speed: str = "normal"  # slow, normal, fast
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

class AdminSettingsUpdate(BaseModel):
    daily_limit_minutes: Optional[int] = None
    teacher_tone: Optional[str] = None
    speech_speed: Optional[str] = None

# ==================== TRAINING MODELS ====================

class SentenceCreate(BaseModel):
    turkish: str
    english: str
    level: str = "A1"
    topic: str = ""

class SentenceUpdate(BaseModel):
    turkish: Optional[str] = None
    english: Optional[str] = None
    level: Optional[str] = None
    topic: Optional[str] = None

class SentenceBulkCreate(BaseModel):
    sentences: List[SentenceCreate]

class DocumentExtractRequest(BaseModel):
    level: str = "A1"
    topic: str = "Genel"

class AIConfigUpdate(BaseModel):
    system_prompt: Optional[str] = None
    custom_instructions: Optional[str] = None
    use_sentence_bank: Optional[bool] = None
    use_documents: Optional[bool] = None
    max_sentences_per_lesson: Optional[int] = None
    category_overrides: Optional[Dict[str, Dict[str, str]]] = None

# ==================== BADGE DEFINITIONS ====================

BADGES = {
    "first_lesson": {
        "id": "first_lesson",
        "name": "İlk Adım",
        "name_en": "First Step",
        "description": "İlk dersini tamamladın!",
        "icon": "rocket",
        "color": "emerald"
    },
    "streak_3": {
        "id": "streak_3",
        "name": "3 Gün Serisi",
        "name_en": "3 Day Streak",
        "description": "3 gün üst üste pratik yaptın!",
        "icon": "flame",
        "color": "orange"
    },
    "streak_7": {
        "id": "streak_7",
        "name": "Haftalık Savaşçı",
        "name_en": "Weekly Warrior",
        "description": "7 gün üst üste pratik yaptın!",
        "icon": "crown",
        "color": "yellow"
    },
    "streak_30": {
        "id": "streak_30",
        "name": "Aylık Şampiyon",
        "name_en": "Monthly Champion",
        "description": "30 gün üst üste pratik yaptın!",
        "icon": "trophy",
        "color": "purple"
    },
    "corrections_10": {
        "id": "corrections_10",
        "name": "Öğrenmeye Açık",
        "name_en": "Open to Learning",
        "description": "10 düzeltme aldın ve öğrendin!",
        "icon": "book",
        "color": "blue"
    },
    "corrections_50": {
        "id": "corrections_50",
        "name": "Hata Avcısı",
        "name_en": "Bug Hunter",
        "description": "50 düzeltme ile ustalaştın!",
        "icon": "target",
        "color": "red"
    },
    "time_1h": {
        "id": "time_1h",
        "name": "1 Saat Pratiği",
        "name_en": "1 Hour Practice",
        "description": "Toplam 1 saat pratik yaptın!",
        "icon": "clock",
        "color": "indigo"
    },
    "time_5h": {
        "id": "time_5h",
        "name": "5 Saat Ustası",
        "name_en": "5 Hour Master",
        "description": "Toplam 5 saat pratik yaptın!",
        "icon": "star",
        "color": "amber"
    },
    "time_10h": {
        "id": "time_10h",
        "name": "10 Saat Efsanesi",
        "name_en": "10 Hour Legend",
        "description": "Toplam 10 saat pratik yaptın!",
        "icon": "medal",
        "color": "gold"
    },
    "level_a2": {
        "id": "level_a2",
        "name": "A2 Seviyesi",
        "name_en": "A2 Level",
        "description": "A2 seviyesine ulaştın!",
        "icon": "award",
        "color": "teal"
    },
    "level_b1": {
        "id": "level_b1",
        "name": "B1 Seviyesi",
        "name_en": "B1 Level",
        "description": "B1 seviyesine ulaştın!",
        "icon": "award",
        "color": "cyan"
    },
    "level_b2": {
        "id": "level_b2",
        "name": "B2 Seviyesi",
        "name_en": "B2 Level",
        "description": "B2 seviyesine ulaştın!",
        "icon": "award",
        "color": "blue"
    },
    "level_c1": {
        "id": "level_c1",
        "name": "C1 Seviyesi",
        "name_en": "C1 Level",
        "description": "C1 seviyesine ulaştın!",
        "icon": "award",
        "color": "violet"
    },
    "level_c2": {
        "id": "level_c2",
        "name": "C2 Ustası",
        "name_en": "C2 Master",
        "description": "En yüksek seviyeye ulaştın!",
        "icon": "gem",
        "color": "pink"
    }
}

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, is_admin: bool = False) -> str:
    payload = {
        "user_id": user_id,
        "is_admin": is_admin,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Dict:
    user = await get_current_user(credentials)
    if not user.get("is_admin", False):
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

# ==================== INIT DATA ====================

async def init_default_data():
    """Initialize default scenarios and admin settings"""
    # Check if scenarios exist
    scenario_count = await db.scenarios.count_documents({})
    if scenario_count == 0:
        default_scenarios = [
            {
                "id": str(uuid.uuid4()), "level": "A1", "title": "Daily Routine",
                "title_tr": "Günlük Rutin", "description": "Practice talking about your daily activities",
                "description_tr": "Günlük aktiviteleriniz hakkında konuşma pratiği",
                "topics": ["wake up", "breakfast", "work", "dinner", "sleep"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "A1", "title": "Greetings & Introductions",
                "title_tr": "Selamlaşma ve Tanışma", "description": "Learn to greet people and introduce yourself",
                "description_tr": "İnsanları selamlamayı ve kendinizi tanıtmayı öğrenin",
                "topics": ["hello", "name", "country", "job", "nice to meet you"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "A2", "title": "Shopping",
                "title_tr": "Alışveriş", "description": "Practice shopping conversations",
                "description_tr": "Alışveriş konuşmaları pratiği",
                "topics": ["price", "size", "color", "pay", "receipt"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "A2", "title": "At the Restaurant",
                "title_tr": "Restoranda", "description": "Order food and interact with waiters",
                "description_tr": "Yemek sipariş edin ve garsonlarla etkileşim kurun",
                "topics": ["menu", "order", "bill", "reservation", "tip"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "B1", "title": "Travel Planning",
                "title_tr": "Seyahat Planlama", "description": "Discuss travel plans and book accommodations",
                "description_tr": "Seyahat planlarını tartışın ve konaklama rezervasyonu yapın",
                "topics": ["flight", "hotel", "itinerary", "budget", "destination"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "B1", "title": "Health & Fitness",
                "title_tr": "Sağlık ve Fitness", "description": "Talk about health habits and exercise",
                "description_tr": "Sağlık alışkanlıkları ve egzersiz hakkında konuşun",
                "topics": ["exercise", "diet", "doctor", "symptoms", "wellness"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "B2", "title": "Job Interview",
                "title_tr": "İş Görüşmesi", "description": "Practice job interview scenarios",
                "description_tr": "İş görüşmesi senaryoları pratiği",
                "topics": ["experience", "skills", "salary", "responsibilities", "career goals"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "B2", "title": "Current Events",
                "title_tr": "Güncel Olaylar", "description": "Discuss news and current affairs",
                "description_tr": "Haberler ve güncel olayları tartışın",
                "topics": ["politics", "economy", "environment", "technology", "society"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "C1", "title": "Business Negotiations",
                "title_tr": "İş Müzakereleri", "description": "Advanced business communication",
                "description_tr": "İleri seviye iş iletişimi",
                "topics": ["contract", "terms", "partnership", "proposal", "compromise"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "C1", "title": "Academic Discussion",
                "title_tr": "Akademik Tartışma", "description": "Engage in academic debates",
                "description_tr": "Akademik tartışmalara katılın",
                "topics": ["thesis", "research", "methodology", "hypothesis", "conclusion"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "C2", "title": "Philosophy & Ethics",
                "title_tr": "Felsefe ve Etik", "description": "Discuss complex philosophical concepts",
                "description_tr": "Karmaşık felsefi kavramları tartışın",
                "topics": ["morality", "existence", "consciousness", "free will", "justice"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            },
            {
                "id": str(uuid.uuid4()), "level": "C2", "title": "Literary Analysis",
                "title_tr": "Edebi Analiz", "description": "Analyze literature and express nuanced opinions",
                "description_tr": "Edebiyatı analiz edin ve nüanslı görüşler ifade edin",
                "topics": ["symbolism", "narrative", "theme", "character development", "critique"], "is_active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
        ]
        await db.scenarios.insert_many(default_scenarios)
        logger.info("Default scenarios created")

    # Check if admin settings exist
    settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
    if not settings:
        default_settings = {
            "id": "global_settings",
            "daily_limit_minutes": 3000,
            "teacher_tone": "friendly",
            "speech_speed": "normal",
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        await db.admin_settings.insert_one(default_settings)
        logger.info("Default admin settings created")

    # Create default admin user if not exists
    admin_email = os.environ.get('ADMIN_EMAIL', 'admin@speakking.com')
    admin_password = os.environ.get('ADMIN_PASSWORD', 'admin123')
    admin = await db.users.find_one({"email": admin_email}, {"_id": 0})
    if not admin:
        admin_user = {
            "id": str(uuid.uuid4()),
            "email": admin_email,
            "password": hash_password(admin_password),
            "name": "Admin",
            "level": "C2",
            "daily_limit_minutes": 999,
            "used_minutes_today": 0,
            "is_admin": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "last_usage_reset": datetime.now(timezone.utc).date().isoformat()
        }
        await db.users.insert_one(admin_user)
        logger.info(f"Default admin user created: {admin_email}")

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Get global settings for daily limit
    settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
    daily_limit = settings.get("daily_limit_minutes", 3000) if settings else 30
    
    user = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "level": "A1",
        "daily_limit_minutes": daily_limit,
        "used_minutes_today": 0,
        "is_admin": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_usage_reset": datetime.now(timezone.utc).date().isoformat()
    }
    await db.users.insert_one(user)
    
    token = create_token(user["id"])
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"], email=user["email"], name=user["name"],
            level=user["level"], daily_limit_minutes=user["daily_limit_minutes"],
            used_minutes_today=user["used_minutes_today"], is_admin=user["is_admin"],
            created_at=user["created_at"]
        )
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    # Reset daily usage if new day
    today = datetime.now(timezone.utc).date().isoformat()
    if user.get("last_usage_reset") != today:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"used_minutes_today": 0, "last_usage_reset": today}}
        )
        user["used_minutes_today"] = 0
    
    token = create_token(user["id"], user.get("is_admin", False))
    return {
        "token": token,
        "user": UserResponse(
            id=user["id"], email=user["email"], name=user["name"],
            level=user["level"], daily_limit_minutes=user["daily_limit_minutes"],
            used_minutes_today=user["used_minutes_today"], is_admin=user.get("is_admin", False),
            created_at=user["created_at"]
        )
    }

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(user: Dict = Depends(get_current_user)):
    # Reset daily usage if new day
    today = datetime.now(timezone.utc).date().isoformat()
    if user.get("last_usage_reset") != today:
        await db.users.update_one(
            {"id": user["id"]},
            {"$set": {"used_minutes_today": 0, "last_usage_reset": today}}
        )
        user["used_minutes_today"] = 0
    
    return UserResponse(
        id=user["id"], email=user["email"], name=user["name"],
        level=user["level"], daily_limit_minutes=user["daily_limit_minutes"],
        used_minutes_today=user["used_minutes_today"], is_admin=user.get("is_admin", False),
        created_at=user["created_at"]
    )

@api_router.put("/auth/level")
async def update_level(level: str, user: Dict = Depends(get_current_user)):
    valid_levels = ["A1", "A2", "B1", "B2", "C1", "C2"]
    if level not in valid_levels:
        raise HTTPException(status_code=400, detail="Invalid level")
    
    await db.users.update_one({"id": user["id"]}, {"$set": {"level": level}})
    return {"message": "Level updated", "level": level}

# ==================== SCENARIO ROUTES ====================

@api_router.get("/scenarios")
async def get_scenarios(level: Optional[str] = None):
    query = {"is_active": True}
    if level:
        query["level"] = level
    scenarios = await db.scenarios.find(query, {"_id": 0}).to_list(100)
    return scenarios

@api_router.get("/scenarios/{scenario_id}")
async def get_scenario(scenario_id: str):
    scenario = await db.scenarios.find_one({"id": scenario_id}, {"_id": 0})
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return scenario

@api_router.post("/scenarios", dependencies=[Depends(get_admin_user)])
async def create_scenario(scenario_data: ScenarioCreate):
    scenario = Scenario(**scenario_data.model_dump())
    await db.scenarios.insert_one(scenario.model_dump())
    return scenario

@api_router.put("/scenarios/{scenario_id}", dependencies=[Depends(get_admin_user)])
async def update_scenario(scenario_id: str, scenario_data: ScenarioCreate):
    result = await db.scenarios.update_one(
        {"id": scenario_id},
        {"$set": scenario_data.model_dump()}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"message": "Scenario updated"}

@api_router.delete("/scenarios/{scenario_id}", dependencies=[Depends(get_admin_user)])
async def delete_scenario(scenario_id: str):
    result = await db.scenarios.delete_one({"id": scenario_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Scenario not found")
    return {"message": "Scenario deleted"}

# ==================== LESSON SESSION ROUTES ====================

@api_router.post("/lessons/start")
async def start_lesson(scenario_id: str, user: Dict = Depends(get_current_user)):
    # Check if user has remaining time
    if False:
        raise HTTPException(status_code=403, detail="Daily limit reached")
    
    # Get scenario
    scenario = await db.scenarios.find_one({"id": scenario_id}, {"_id": 0})
    if not scenario:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    session_data = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "scenario_id": scenario_id,
        "level": scenario["level"],
        "started_at": datetime.now(timezone.utc).isoformat(),
        "ended_at": None,
        "duration_minutes": 0,
        "corrections": [],
        "vocabulary_hints": [],
        "transcript": []
    }
    await db.lesson_sessions.insert_one(session_data)
    
    # Remove _id that MongoDB adds
    session_response = {k: v for k, v in session_data.items() if k != "_id"}
    
    remaining_minutes = user["daily_limit_minutes"] - user["used_minutes_today"]
    return {
        "session": session_response,
        "scenario": scenario,
        "remaining_minutes": remaining_minutes
    }

@api_router.post("/lessons/{session_id}/end")
async def end_lesson(session_id: str, user: Dict = Depends(get_current_user)):
    session = await db.lesson_sessions.find_one({"id": session_id, "user_id": user["id"]}, {"_id": 0})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    if session["ended_at"]:
        raise HTTPException(status_code=400, detail="Session already ended")
    
    # Calculate duration
    started = datetime.fromisoformat(session["started_at"].replace('Z', '+00:00'))
    ended = datetime.now(timezone.utc)
    duration_minutes = (ended - started).total_seconds() / 60
    
    # Update session
    await db.lesson_sessions.update_one(
        {"id": session_id},
        {"$set": {"ended_at": ended.isoformat(), "duration_minutes": duration_minutes}}
    )
    
    # Update user's used minutes
    new_used_minutes = user["used_minutes_today"] + duration_minutes
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"used_minutes_today": new_used_minutes}}
    )
    
    return {"message": "Session ended", "duration_minutes": duration_minutes}

@api_router.get("/lessons/history")
async def get_lesson_history(user: Dict = Depends(get_current_user)):
    sessions = await db.lesson_sessions.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("started_at", -1).to_list(50)
    return sessions

# ==================== STUDENT PROGRESS & BADGES ====================

async def check_and_award_badges(user_id: str):
    """Check user progress and award badges"""
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        return []
    
    current_badges = user.get("badges") or []
    new_badges = []
    
    # Get user stats
    sessions = await db.lesson_sessions.find({"user_id": user_id}, {"_id": 0}).to_list(1000)
    total_sessions = len(sessions)
    total_minutes = sum(s.get("duration_minutes", 0) for s in sessions)
    total_corrections = sum(len(s.get("corrections", [])) for s in sessions)
    
    # Calculate streak
    today = datetime.now(timezone.utc).date()
    practice_dates = set()
    for s in sessions:
        if s.get("started_at"):
            try:
                date = datetime.fromisoformat(s["started_at"].replace('Z', '+00:00')).date()
                practice_dates.add(date)
            except:
                pass
    
    streak = 0
    check_date = today
    while check_date in practice_dates:
        streak += 1
        check_date -= timedelta(days=1)
    
    # Check for badges
    badge_checks = [
        ("first_lesson", total_sessions >= 1),
        ("streak_3", streak >= 3),
        ("streak_7", streak >= 7),
        ("streak_30", streak >= 30),
        ("corrections_10", total_corrections >= 10),
        ("corrections_50", total_corrections >= 50),
        ("time_1h", total_minutes >= 60),
        ("time_5h", total_minutes >= 300),
        ("time_10h", total_minutes >= 600),
        ("level_a2", user.get("level") in ["A2", "B1", "B2", "C1", "C2"]),
        ("level_b1", user.get("level") in ["B1", "B2", "C1", "C2"]),
        ("level_b2", user.get("level") in ["B2", "C1", "C2"]),
        ("level_c1", user.get("level") in ["C1", "C2"]),
        ("level_c2", user.get("level") == "C2"),
    ]
    
    for badge_id, condition in badge_checks:
        if condition and badge_id not in current_badges:
            current_badges.append(badge_id)
            new_badges.append(BADGES[badge_id])
    
    # Update user badges
    if new_badges:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"badges": current_badges}}
        )
    
    return new_badges

@api_router.get("/student/progress")
async def get_student_progress(user: Dict = Depends(get_current_user)):
    """Get detailed student progress and stats"""
    user_id = user["id"]
    
    # Get all completed sessions
    sessions = await db.lesson_sessions.find(
        {"user_id": user_id}, {"_id": 0}
    ).to_list(1000)
    
    # Calculate stats
    total_sessions = len(sessions)
    total_minutes = sum(s.get("duration_minutes", 0) for s in sessions)
    total_corrections = sum(len(s.get("corrections", [])) for s in sessions)
    
    # Calculate streak
    today = datetime.now(timezone.utc).date()
    practice_dates = set()
    for s in sessions:
        if s.get("started_at"):
            try:
                date = datetime.fromisoformat(s["started_at"].replace('Z', '+00:00')).date()
                practice_dates.add(date)
            except:
                pass
    
    streak = 0
    check_date = today
    while check_date in practice_dates:
        streak += 1
        check_date -= timedelta(days=1)
    
    # Weekly stats (last 7 days)
    weekly_minutes = []
    for i in range(7):
        day = today - timedelta(days=6-i)
        day_minutes = sum(
            s.get("duration_minutes", 0) for s in sessions
            if s.get("started_at") and datetime.fromisoformat(s["started_at"].replace('Z', '+00:00')).date() == day
        )
        weekly_minutes.append({
            "day": day.strftime("%a"),
            "date": day.isoformat(),
            "minutes": round(day_minutes, 1)
        })
    
    # Level progress
    level_order = ["A1", "A2", "B1", "B2", "C1", "C2"]
    current_level_index = level_order.index(user.get("level", "A1"))
    level_progress = ((current_level_index + 1) / len(level_order)) * 100
    
    # Get user badges
    user_badges = user.get("badges") or []
    badges_data = [BADGES[b] for b in user_badges if b in BADGES]
    
    # Check for new badges
    new_badges = await check_and_award_badges(user_id)
    
    return {
        "total_sessions": total_sessions,
        "total_minutes": round(total_minutes, 1),
        "total_hours": round(total_minutes / 60, 1),
        "total_corrections": total_corrections,
        "current_streak": streak,
        "longest_streak": max(streak, user.get("longest_streak", 0)),
        "weekly_stats": weekly_minutes,
        "level": user.get("level", "A1"),
        "level_progress": level_progress,
        "badges": badges_data,
        "new_badges": new_badges,
        "daily_limit": user.get("daily_limit_minutes", 3000),
        "used_today": round(user.get("used_minutes_today", 0), 1)
    }

@api_router.get("/student/badges")
async def get_student_badges(user: Dict = Depends(get_current_user)):
    """Get all badges and user's earned badges"""
    await check_and_award_badges(user["id"])
    updated_user = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    user_badges = (updated_user or user).get("badges") or []
    
    all_badges = []
    for badge_id, badge_data in BADGES.items():
        badge_info = {**badge_data, "earned": badge_id in user_badges}
        all_badges.append(badge_info)
    
    return {
        "earned_count": len(user_badges),
        "total_count": len(BADGES),
        "badges": all_badges
    }

@api_router.get("/student/recent-corrections")
async def get_recent_corrections(user: Dict = Depends(get_current_user), limit: int = 20):
    """Get recent corrections for review"""
    sessions = await db.lesson_sessions.find(
        {"user_id": user["id"]}, {"_id": 0}
    ).sort("started_at", -1).to_list(50)
    
    corrections = []
    for session in sessions:
        for correction in session.get("corrections", []):
            corrections.append({
                **correction,
                "session_id": session["id"],
                "level": session.get("level", "A1"),
                "date": session.get("ended_at") or session.get("started_at", "")
            })
            if len(corrections) >= limit:
                break
        if len(corrections) >= limit:
            break
    
    return corrections

# ==================== HINT ROUTE ====================

class HintRequest(BaseModel):
    turkish_sentence: str
    level: str = "A1"

@api_router.post("/hint/translate")
async def get_translation_hint(request: HintRequest, user: Dict = Depends(get_current_user)):
    """Get English translation for hint system"""
    try:
        prompt = f"Translate this Turkish sentence to English (level {request.level}): {request.turkish_sentence}"
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY')}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "Speakking"
                },
                json={
                    "model": "google/gemini-2.5-flash",
                    "messages": [
                        {"role": "system", "content": "You are a translation assistant. Translate the given Turkish sentence to English. Only respond with the English translation, nothing else. Keep it simple and appropriate for the given CEFR level."},
                        {"role": "user", "content": prompt}
                    ]
                },
                timeout=30.0
            )
            response.raise_for_status()
            data = response.json()
            raw_response = data["choices"][0]["message"]["content"]
        
        # Clean up the response
        translation = raw_response.strip().strip('"').strip("'")
        
        return {"translation": translation, "success": True}
    except Exception as e:
        logger.error(f"Hint translation error: {str(e)}")
        return {"translation": None, "success": False, "error": str(e)}

# ==================== AI CHAT ROUTE ====================

@api_router.post("/chat")
async def chat_with_ai(chat_data: ChatMessage, user: Dict = Depends(get_current_user)):
    try:
        # Check remaining time
        if False:
            raise HTTPException(status_code=403, detail="Daily limit reached")
        
        # Get session
        session = await db.lesson_sessions.find_one({"id": chat_data.session_id}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        # Get scenario and settings
        scenario = await db.scenarios.find_one({"id": session["scenario_id"]}, {"_id": 0})
        settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
        
        tone = settings.get("teacher_tone", "friendly") if settings else "friendly"
        
        # Build training-enhanced system message
        system_message = await build_training_prompt(session.get('level', 'A1'), scenario, tone, user.get('name', 'User'))

        # Build conversation history
        messages = [{"role": "system", "content": system_message}]
        for entry in session.get("transcript", []):
            if entry.get("user"):
                messages.append({"role": "user", "content": entry["user"]})
            if entry.get("ai_raw"):
                messages.append({"role": "assistant", "content": entry["ai_raw"]})
            elif entry.get("ai"):
                messages.append({"role": "assistant", "content": entry["ai"]})
        messages.append({"role": "user", "content": chat_data.message})

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY')}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "Speakking"
                },
                json={
                    "model": "google/gemini-2.5-flash",
                    "messages": messages
                },
                timeout=30.0
            )
            resp.raise_for_status()
            data = resp.json()
            raw_response = data["choices"][0]["message"]["content"]

        # Parse structured data from response
        parsed = parse_structured_response(raw_response)
        
        # Save to transcript
        transcript_entry = {
            "user": chat_data.message,
            "ai": parsed["text"],
            "ai_raw": raw_response,
            "corrections": parsed["corrections"],
            "vocabulary": parsed["vocabulary"],
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
        await db.lesson_sessions.update_one(
            {"id": chat_data.session_id},
            {"$push": {"transcript": transcript_entry}}
        )
        
        # Save corrections to session
        if parsed["corrections"]:
            await db.lesson_sessions.update_one(
                {"id": chat_data.session_id},
                {"$push": {"corrections": {"$each": parsed["corrections"]}}}
            )
        
        return {
            "response": parsed["text"],
            "session_id": chat_data.session_id,
            "corrections": parsed["corrections"],
            "vocabulary": parsed["vocabulary"]
        }
    
    except Exception as e:
        import traceback
        with open("error.log", "a") as f:
            f.write(f"Chat error: {str(e)}\n{traceback.format_exc()}\n")
        logger.error(f"AI Chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

# ==================== ADMIN ROUTES ====================

@api_router.get("/admin/settings")
async def get_admin_settings(user: Dict = Depends(get_admin_user)):
    settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
    return settings or AdminSettings().model_dump()

@api_router.put("/admin/settings")
async def update_admin_settings(settings_data: AdminSettingsUpdate, user: Dict = Depends(get_admin_user)):
    update_dict = {k: v for k, v in settings_data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.admin_settings.update_one(
        {"id": "global_settings"},
        {"$set": update_dict},
        upsert=True
    )
    return {"message": "Settings updated"}

@api_router.get("/admin/users")
async def get_all_users(user: Dict = Depends(get_admin_user)):
    users = await db.users.find({}, {"_id": 0, "password": 0}).to_list(100)
    return users

@api_router.post("/admin/users")
async def admin_create_user(user_data: AdminUserCreate, admin_user: Dict = Depends(get_admin_user)):
    existing = await db.users.find_one({"email": user_data.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    if user_data.daily_limit_minutes is None:
        settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
        daily_limit = settings.get("daily_limit_minutes", 3000) if settings else 30
    else:
        daily_limit = user_data.daily_limit_minutes
        
    new_user = {
        "id": str(uuid.uuid4()),
        "email": user_data.email,
        "password": hash_password(user_data.password),
        "name": user_data.name,
        "level": user_data.level,
        "daily_limit_minutes": daily_limit,
        "used_minutes_today": 0,
        "last_active_date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "is_admin": user_data.is_admin
    }
    
    await db.users.insert_one(new_user)
    
    new_user.pop("password", None)
    new_user.pop("_id", None)
    return new_user

@api_router.get("/admin/stats")
async def get_admin_stats(user: Dict = Depends(get_admin_user)):
    total_users = await db.users.count_documents({})
    total_sessions = await db.lesson_sessions.count_documents({})
    total_scenarios = await db.scenarios.count_documents({})
    
    # Get today's sessions
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_sessions = await db.lesson_sessions.count_documents({
        "started_at": {"$gte": today_start.isoformat()}
    })
    
    return {
        "total_users": total_users,
        "total_sessions": total_sessions,
        "total_scenarios": total_scenarios,
        "today_sessions": today_sessions
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Speakking API is running"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "service": "Speakking API"}

# ==================== VOICE ROUTES (STT & TTS) ====================

@api_router.post("/voice/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(...),
    user: Dict = Depends(get_current_user)
):
    """Transcribe audio to text using OpenAI Whisper"""
    try:
        # Read audio file
        audio_bytes = await audio.read()
        
        # Initialize STT
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        
        # Create a file-like object from bytes
        import io
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = audio.filename or "audio.webm"
        
        # Transcribe
        response = await stt.transcribe(
            file=audio_file,
            model="whisper-1",
            response_format="json",
            language="en"  # Expecting English responses from user
        )
        
        return {"text": response.text, "success": True}
    
    except Exception as e:
        logger.error(f"Transcription error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

async def synthesize_elevenlabs(text: str, api_key: str, voice_id: str) -> bytes:
    """Generate hyper-realistic, human-like voice using ElevenLabs API"""
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json"
    }
    data = {
        "text": text,
        "model_id": "eleven_multilingual_v2",
        "voice_settings": {
            "stability": 0.45,
            "similarity_boost": 0.8,
            "style": 0.1,
            "use_speaker_boost": True
        }
    }
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=data, timeout=30.0)
        resp.raise_for_status()
        return resp.content

async def synthesize_fish_speech(text: str, api_key: str, voice_id: str = "") -> bytes:
    """Generate hyper-realistic, human-like voice using Fish Speech Cloud API"""
    url = "https://api.fish.audio/v1/tts"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    data = {
        "text": text,
        "format": "mp3"
    }
    if voice_id:
        data["reference_id"] = voice_id
        
    async with httpx.AsyncClient() as client:
        resp = await client.post(url, headers=headers, json=data, timeout=12.0)
        resp.raise_for_status()
        return resp.content

async def synthesize_edge_tts(text: str, speed: float = 1.0) -> bytes:
    """Fast local/cloud Edge-TTS — typically 1-2 seconds"""
    import edge_tts
    rate = "+0%"
    if speed < 1.0:
        rate = "-15%"
    elif speed > 1.0:
        rate = "+20%"
    audio_bytes = b""
    communicate = edge_tts.Communicate(text, "tr-TR-EmelNeural", rate=rate)
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            audio_bytes += chunk["data"]
    return audio_bytes

async def generate_speech_audio(text: str, voice: str = "nova", speed: float = 1.0) -> tuple:
    """
    Generate speech audio bytes. Returns (audio_bytes, format).
    fast mode: Edge-TTS first for low latency; premium mode: Fish/Chatterbox first.
    """
    import emoji
    clean_text = emoji.replace_emoji(text, replace='').strip()
    if not clean_text:
        return b"", "mp3"

    audio_bytes = b""

    async def try_edge():
        nonlocal audio_bytes
        try:
            audio_bytes = await synthesize_edge_tts(clean_text, speed)
            if audio_bytes:
                logger.info("TTS: Edge-TTS")
                return True
        except Exception as e:
            logger.error(f"Edge-TTS failed: {e}")
            audio_bytes = b""
        return False

    async def try_openai(use_hd: bool = False):
        nonlocal audio_bytes
        if not EMERGENT_LLM_KEY:
            return False
        try:
            tts = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
            audio_bytes = await tts.generate_speech(
                text=clean_text,
                model="tts-1-hd" if use_hd else "tts-1",
                voice=voice,
                speed=speed
            )
            if audio_bytes:
                logger.info("TTS: OpenAI")
                return True
        except Exception as e:
            logger.error(f"OpenAI TTS failed: {e}")
            audio_bytes = b""
        return False

    async def try_elevenlabs():
        nonlocal audio_bytes
        if not ELEVENLABS_API_KEY:
            return False
        try:
            audio_bytes = await synthesize_elevenlabs(
                text=clean_text,
                api_key=ELEVENLABS_API_KEY,
                voice_id=ELEVENLABS_VOICE_ID
            )
            if audio_bytes:
                logger.info("TTS: ElevenLabs")
                return True
        except Exception as e:
            logger.error(f"ElevenLabs TTS failed: {e}")
            audio_bytes = b""
        return False

    async def try_fish():
        nonlocal audio_bytes
        if not (USE_FISH_SPEECH and FISH_API_KEY):
            return False
        try:
            audio_bytes = await synthesize_fish_speech(
                text=clean_text,
                api_key=FISH_API_KEY,
                voice_id=FISH_VOICE_ID
            )
            if audio_bytes:
                logger.info("TTS: Fish Speech")
                return True
        except Exception as e:
            logger.error(f"Fish Speech failed: {e}")
            audio_bytes = b""
        return False

    async def try_chatterbox():
        nonlocal audio_bytes
        if not USE_CHATTERBOX:
            return False
        try:
            model = await get_chatterbox_model()
            from starlette.concurrency import run_in_threadpool
            import io
            import torchaudio
            wav = await run_in_threadpool(model.generate, clean_text, language_id="tr")
            buffer = io.BytesIO()
            torchaudio.save(buffer, wav.cpu(), sample_rate=model.sr, format="wav")
            audio_bytes = buffer.getvalue()
            if audio_bytes:
                logger.info("TTS: Chatterbox")
                return True
        except Exception as e:
            logger.error(f"Chatterbox failed: {e}")
            audio_bytes = b""
        return False

    if TTS_MODE == "fast":
        if await try_edge():
            return audio_bytes, "mp3"
        if await try_openai(use_hd=False):
            return audio_bytes, "mp3"
        if await try_elevenlabs():
            return audio_bytes, "mp3"
    else:
        if await try_fish():
            return audio_bytes, "mp3"
        if await try_chatterbox():
            return audio_bytes, "wav"
        if await try_elevenlabs():
            return audio_bytes, "mp3"
        if await try_openai(use_hd=True):
            return audio_bytes, "mp3"

    if await try_edge():
        return audio_bytes, "mp3"

    raise HTTPException(status_code=500, detail="No TTS engine available")

async def get_chatterbox_model():
    """Lazily load Chatterbox Multilingual model on the best available device in a non-blocking thread"""
    global chatterbox_model
    if chatterbox_model is not None:
        return chatterbox_model
        
    logger.info("Initializing Resemble AI Chatterbox Multilingual model...")
    import torch
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    from starlette.concurrency import run_in_threadpool
    
    # Determine the best device (mps on Mac, cuda on GPU, cpu as fallback)
    if torch.backends.mps.is_available():
        device = "mps"
    elif torch.cuda.is_available():
        device = "cuda"
    else:
        device = "cpu"
        
    logger.info(f"Loading Chatterbox model on device: {device}...")
    # This will load locally. The 3.21 GB model will automatically download from Hugging Face on first use.
    chatterbox_model = await run_in_threadpool(ChatterboxMultilingualTTS.from_pretrained, torch.device(device))
    logger.info("Chatterbox model loaded successfully!")
    return chatterbox_model

@api_router.post("/voice/speak")
async def text_to_speech(
    text: str,
    voice: str = "nova",
    user: Dict = Depends(get_current_user)
):
    """Convert text to speech — fast mode uses Edge-TTS first (~1-2s latency)"""
    try:
        settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
        speed_map = {"slow": 0.85, "normal": 1.0, "fast": 1.2}
        speed = speed_map.get(settings.get("speech_speed", "normal") if settings else "normal", 1.0)

        audio_bytes, audio_format = await generate_speech_audio(text, voice=voice, speed=speed)
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        return {"audio": audio_base64, "format": audio_format, "success": True}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Text-to-speech failed: {str(e)}")

class VoiceChatRequest(BaseModel):
    session_id: str
    audio_base64: str  # Base64 encoded audio from frontend

@api_router.post("/voice/chat")
async def voice_chat(
    request: VoiceChatRequest,
    user: Dict = Depends(get_current_user)
):
    """Complete voice chat: transcribe -> AI response -> TTS"""
    try:
        # Check remaining time
        if False:
            raise HTTPException(status_code=403, detail="Daily limit reached")
        
        # 1. Decode and transcribe audio
        audio_bytes = base64.b64decode(request.audio_base64)
        
        stt = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
        import io
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "audio.webm"
        
        transcription = await stt.transcribe(
            file=audio_file,
            model="whisper-1",
            response_format="json",
            language="en"
        )
        user_text = transcription.text
        
        # 2. Get AI response (reuse chat logic)
        session = await db.lesson_sessions.find_one({"id": request.session_id}, {"_id": 0})
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        
        scenario = await db.scenarios.find_one({"id": session["scenario_id"]}, {"_id": 0})
        settings = await db.admin_settings.find_one({"id": "global_settings"}, {"_id": 0})
        
        tone = settings.get("teacher_tone", "friendly") if settings else "friendly"
        
        # Build training-enhanced system message
        system_message = await build_training_prompt(session.get('level', 'A1'), scenario, tone, user.get('name', 'User'))

        # Build conversation history
        messages = [{"role": "system", "content": system_message}]
        for entry in session.get("transcript", []):
            if entry.get("user"):
                messages.append({"role": "user", "content": entry["user"]})
            if entry.get("ai_raw"):
                messages.append({"role": "assistant", "content": entry["ai_raw"]})
            elif entry.get("ai"):
                messages.append({"role": "assistant", "content": entry["ai"]})
        messages.append({"role": "user", "content": user_text})

        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY')}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "Speakking"
                },
                json={
                    "model": "google/gemini-2.5-flash",
                    "messages": messages
                },
                timeout=30.0
            )
            resp.raise_for_status()
            data = resp.json()
            ai_response = data["choices"][0]["message"]["content"]
        
        # Parse structured data from response
        parsed = parse_structured_response(ai_response)
        
        # Save to transcript
        transcript_entry = {
            "user": user_text,
            "ai": parsed["text"],
            "ai_raw": ai_response,
            "corrections": parsed["corrections"],
            "vocabulary": parsed["vocabulary"],
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "voice": True
        }
        await db.lesson_sessions.update_one(
            {"id": request.session_id},
            {"$push": {"transcript": transcript_entry}}
        )
        
        # Save corrections to session
        if parsed["corrections"]:
            await db.lesson_sessions.update_one(
                {"id": request.session_id},
                {"$push": {"corrections": {"$each": parsed["corrections"]}}}
            )
        
        audio_bytes, audio_format = await generate_speech_audio(parsed["text"], voice="nova", speed=speed)
        audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
        
        return {
            "user_text": user_text,
            "ai_response": parsed["text"],
            "audio": audio_base64,
            "format": audio_format,
            "success": True,
            "corrections": parsed["corrections"],
            "vocabulary": parsed["vocabulary"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice chat error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Voice chat failed: {str(e)}")

# ==================== SENTENCE BANK ROUTES ====================

@api_router.get("/admin/sentences")
async def get_sentences(
    level: Optional[str] = None,
    topic: Optional[str] = None,
    user: Dict = Depends(get_admin_user)
):
    query = {}
    if level:
        query["level"] = level
    if topic:
        query["topic"] = topic
    sentences = await db.sentences.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    return sentences

@api_router.post("/admin/sentences")
async def create_sentence(data: SentenceCreate, user: Dict = Depends(get_admin_user)):
    sentence = {
        "id": str(uuid.uuid4()),
        "turkish": data.turkish,
        "english": data.english,
        "level": data.level,
        "topic": data.topic,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.sentences.insert_one(sentence)
    return {k: v for k, v in sentence.items() if k != "_id"}

@api_router.post("/admin/sentences/bulk")
async def bulk_create_sentences(data: SentenceBulkCreate, user: Dict = Depends(get_admin_user)):
    if not data.sentences:
        raise HTTPException(status_code=400, detail="No sentences provided")
    docs = []
    for s in data.sentences:
        docs.append({
            "id": str(uuid.uuid4()),
            "turkish": s.turkish,
            "english": s.english,
            "level": s.level,
            "topic": s.topic,
            "created_at": datetime.now(timezone.utc).isoformat()
        })
    await db.sentences.insert_many(docs)
    return {"message": f"{len(docs)} cumle eklendi", "count": len(docs)}

@api_router.put("/admin/sentences/{sentence_id}")
async def update_sentence(sentence_id: str, data: SentenceUpdate, user: Dict = Depends(get_admin_user)):
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = await db.sentences.update_one({"id": sentence_id}, {"$set": update_dict})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Sentence not found")
    return {"message": "Updated"}

@api_router.delete("/admin/sentences/{sentence_id}")
async def delete_sentence(sentence_id: str, user: Dict = Depends(get_admin_user)):
    result = await db.sentences.delete_one({"id": sentence_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Sentence not found")
    return {"message": "Deleted"}

# ==================== DOCUMENT ROUTES ====================

@api_router.post("/admin/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    user: Dict = Depends(get_admin_user)
):
    allowed_types = ["application/pdf", "text/plain", "text/csv",
                     "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Desteklenmeyen dosya tipi. PDF, TXT, CSV veya DOCX yukleyin.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Dosya boyutu 10MB'dan buyuk olamaz")

    doc_id = str(uuid.uuid4())
    storage_path = f"{APP_NAME}/documents/{doc_id}/{file.filename}"

    # Extract text content for AI training
    text_content = ""
    if file.content_type == "text/plain" or file.content_type == "text/csv":
        text_content = content.decode("utf-8", errors="ignore")
    elif file.content_type == "application/pdf":
        try:
            import fitz
            pdf_doc = fitz.open(stream=content, filetype="pdf")
            for page in pdf_doc:
                text_content += page.get_text()
            pdf_doc.close()
        except Exception as e:
            logger.warning(f"PDF text extraction failed: {e}")
            text_content = "[PDF icerik cikarilmadi]"
    elif file.content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        try:
            import docx
            import io
            doc = docx.Document(io.BytesIO(content))
            text_content = "\n".join([paragraph.text for paragraph in doc.paragraphs])
        except Exception as e:
            logger.warning(f"DOCX text extraction failed: {e}")
            text_content = "[DOCX icerik cikarilmadi]"

    # Try to upload to object storage
    file_url = None
    try:
        put_object(storage_path, content, file.content_type)
        file_url = storage_path
    except Exception as e:
        logger.warning(f"Object storage upload failed, storing locally: {e}")
        local_dir = ROOT_DIR / "uploads"
        local_dir.mkdir(exist_ok=True)
        local_path = local_dir / f"{doc_id}_{file.filename}"
        local_path.write_bytes(content)
        file_url = f"local:{local_path}"

    doc_record = {
        "id": doc_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "file_url": file_url,
        "text_content": text_content[:50000],  # Limit stored text
        "size_bytes": len(content),
        "uploaded_by": user["id"],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.documents.insert_one(doc_record)
    return {k: v for k, v in doc_record.items() if k != "_id"}

@api_router.get("/admin/documents")
async def list_documents(user: Dict = Depends(get_admin_user)):
    docs = await db.documents.find({}, {"_id": 0, "text_content": 0}).sort("created_at", -1).to_list(100)
    return docs

@api_router.delete("/admin/documents/{doc_id}")
async def delete_document(doc_id: str, user: Dict = Depends(get_admin_user)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.documents.delete_one({"id": doc_id})
    return {"message": "Document deleted"}

@api_router.get("/admin/documents/{doc_id}/content")
async def get_document_content(doc_id: str, user: Dict = Depends(get_admin_user)):
    doc = await db.documents.find_one({"id": doc_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"id": doc["id"], "filename": doc["filename"], "text_content": doc.get("text_content", "")}

@api_router.post("/admin/documents/{doc_id}/extract-to-bank")
async def extract_document_to_sentence_bank(
    doc_id: str,
    data: DocumentExtractRequest,
    user: Dict = Depends(get_admin_user)
):
    doc = await db.documents.find_one({"id": doc_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
        
    text_content = doc.get("text_content", "")
    if not text_content.strip():
        raise HTTPException(status_code=400, detail="Document has no text content")
        
    try:
        prompt = f"""
        Aşağıdaki metinden Türkçe-İngilizce cümle çiftlerini çıkar.
        Metin İngilizce eğitimi için hazırlanmıştır ve genellikle bir İngilizce cümle ve parantez içinde veya yanında Türkçe karşılığını içerir.
        
        Her bir cümleyi analiz et ve Türkçe-İngilizce karşılıklarını ayır.
        Yalnızca JSON formatında, şu şablona uygun bir liste döndür:
        [
          {{"turkish": "Örnek Türkçe cümle", "english": "Example English sentence"}}
        ]
        
        Sadece geçerli bir JSON listesi döndür. Markdown etiketleri (```json vb.) kullanma. Kod blogu içine alma, doğrudan JSON string olarak döndür.
        
        Metin:
        {text_content}
        """
        
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.environ.get('OPENROUTER_API_KEY')}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "Speakking"
                },
                json={
                    "model": "google/gemini-2.5-flash",
                    "messages": [
                        {"role": "system", "content": "You are a data extraction assistant. You only output valid JSON lists of objects containing 'turkish' and 'english' keys."},
                        {"role": "user", "content": prompt}
                    ]
                },
                timeout=60.0
            )
            response.raise_for_status()
            res_data = response.json()
            raw_response = res_data["choices"][0]["message"]["content"]
            
        # Clean up Markdown formatting if any
        cleaned = raw_response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("\n", 1)[1]
        if cleaned.endswith("```"):
            cleaned = cleaned.rsplit("\n", 1)[0]
        cleaned = cleaned.strip()
        if cleaned.startswith("json"):
            cleaned = cleaned[4:].strip()
            
        import json
        extracted_sentences = json.loads(cleaned)
        
        if not isinstance(extracted_sentences, list):
            raise ValueError("LLM response is not a list")
            
        docs = []
        for s in extracted_sentences:
            if "turkish" in s and "english" in s:
                docs.append({
                    "id": str(uuid.uuid4()),
                    "turkish": s["turkish"].strip(),
                    "english": s["english"].strip(),
                    "level": data.level,
                    "topic": data.topic,
                    "created_at": datetime.now(timezone.utc).isoformat()
                })
                
        if docs:
            await db.sentences.insert_many(docs)
            return {"message": f"Successfully added {len(docs)} sentences to the bank", "count": len(docs)}
        else:
            return {"message": "No valid sentences found in the extraction", "count": 0}
            
    except Exception as e:
        logger.error(f"Failed to extract sentences from document: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Cümle çıkarma hatası: {str(e)}")

# ==================== AI CONFIG ROUTES ====================

@api_router.get("/admin/ai-config")
async def get_ai_config(user: Dict = Depends(get_admin_user)):
    config = await db.ai_config.find_one({"id": "ai_training_config"}, {"_id": 0})
    if not config:
        config = {
            "id": "ai_training_config",
            "system_prompt": "",
            "custom_instructions": "",
            "use_sentence_bank": True,
            "use_documents": True,
            "max_sentences_per_lesson": 10,
            "category_overrides": {}
        }
        await db.ai_config.insert_one(config)
        config.pop("_id", None)
    return config

@api_router.put("/admin/ai-config")
async def update_ai_config(data: AIConfigUpdate, user: Dict = Depends(get_admin_user)):
    update_dict = {k: v for k, v in data.model_dump().items() if v is not None}
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.ai_config.update_one(
        {"id": "ai_training_config"},
        {"$set": update_dict},
        upsert=True
    )
    return {"message": "AI config updated"}

# ==================== TRAINING-ENHANCED PROMPT BUILDER ====================

async def build_training_prompt(session_level: str, scenario: dict, tone: str, user_name: str) -> str:
    """Build system prompt enriched with sentence bank + documents + custom config + function calling"""
    ai_config = await db.ai_config.find_one({"id": "ai_training_config"}, {"_id": 0})
    if not ai_config:
        ai_config = {"system_prompt": "", "custom_instructions": "", "use_sentence_bank": True,
                      "use_documents": True, "max_sentences_per_lesson": 10, "category_overrides": {}}

    # Base prompt
    base = f"""You are a close, fun, and extremely friendly language companion (like a kanka or close buddy chatting on WhatsApp, using very casual and warm language) helping a Turkish speaker practice English translation.
Your conversational responses must sound exactly like a real close friend (kanka) talking to the user.
Your role is a "Language Buddy" with these rules:

1. Give the user a Turkish sentence and ask them to translate it to English.
2. The sentences should be appropriate for {session_level} level (CEFR).
3. Topic: {scenario['title']} - {scenario['description']}
4. After the user responds, evaluate their translation:
   - If correct, praise them enthusiastically like a friend and give a new sentence.
   - If incorrect, explain it gently and naturally, providing the correct version without sounding like a strict teacher.

5. Your tone should be EXTREMELY casual, warm, natural, and friendly. Use close friend expressions like "Süper kanka!", "Harika gidiyoruz!", "Çok yaklaştın kanka ama ufak bir pürüz var", "Hadi pes etmek yok kanka, şimdi şuna bakalım:". Talk exactly like a WhatsApp best friend, warm and relaxed. Never sound like a formal teacher.
6. Always address the user warmly by their name: {user_name}.
7. Keep your conversational response short, highly energetic, and engaging. DO NOT be boring.

=== STRUCTURED OUTPUT FUNCTIONS ===
You MUST use these structured blocks in your responses:

**reportCorrection** - When the user's translation has errors, include this block:
[CORRECTION]{{"original":"user's attempt","correction":"correct English translation","explanation":"brief grammar/vocabulary explanation in Turkish","turkish":"the Turkish sentence that was given"}}[/CORRECTION]

**displayVocabularyHints** - After each response, include 1-3 useful vocabulary items related to the conversation:
[VOCABULARY]{{"word":"English word","meaning":"Turkish meaning","example":"example sentence in English"}}[/VOCABULARY]

IMPORTANT RULES FOR STRUCTURED BLOCKS:
- Always include [CORRECTION] block when the user makes a mistake
- Always include at least 1 [VOCABULARY] block with every response
- Place blocks at the END of your message, after your conversational text
- You can include multiple [VOCABULARY] blocks
- Write your conversational response FIRST, then add the blocks
- The blocks will be parsed and displayed as cards, so the user will see them nicely formatted

Example response when user makes an error:
"Çok yaklaştın {user_name}! Sadece ufak bir detayı kaçırmışız. Doğru çeviri 'I go to school every day' olmalıydı. 'go to' kalıbını cebimize koyalım! 😊

Hadi pes etmek yok, şimdi şunu deneyelim: **'Her akşam kitap okurum'**"

[CORRECTION]{{"original":"I am go school every day","correction":"I go to school every day","explanation":"'go to' kalibini kullanmalisin. 'am go' degil 'go' yeterli cunku Simple Present tense.","turkish":"Her gun okula giderim"}}[/CORRECTION]
[VOCABULARY]{{"word":"every day","meaning":"her gun","example":"I drink coffee every day."}}[/VOCABULARY]
[VOCABULARY]{{"word":"go to","meaning":"-e/-a gitmek","example":"I go to the park on weekends."}}[/VOCABULARY]

Example response when user is correct:
"Harikasın {user_name}! Kesinlikle doğru çeviri, harika gidiyorsun! 🚀

Hız kesmeden devam edelim, sence şu cümle nasıl çevrilir? **'Yarın hava güzel olacak'**"

[VOCABULARY]{{"word":"weather","meaning":"hava","example":"The weather is nice today."}}[/VOCABULARY]
[VOCABULARY]{{"word":"tomorrow","meaning":"yarin","example":"I will go shopping tomorrow."}}[/VOCABULARY]
"""

    # Get category overrides if any
    cat_overrides = ai_config.get("category_overrides", {}).get(session_level, {})
    sys_prompt = cat_overrides.get("system_prompt") if "system_prompt" in cat_overrides and cat_overrides["system_prompt"].strip() else ai_config.get("system_prompt")
    cust_inst = cat_overrides.get("custom_instructions") if "custom_instructions" in cat_overrides and cat_overrides["custom_instructions"].strip() else ai_config.get("custom_instructions")

    # Append custom system prompt from admin
    if sys_prompt:
        base += f"\n\nADDITIONAL INSTRUCTIONS FROM ADMIN:\n{sys_prompt}\n"

    if cust_inst:
        base += f"\nCUSTOM TEACHING NOTES:\n{cust_inst}\n"

    # Append sentence bank examples
    if ai_config.get("use_sentence_bank", True):
        max_s = ai_config.get("max_sentences_per_lesson", 10)
        query = {"level": session_level}
        topic = scenario.get("title", "")
        if topic:
            query["$or"] = [{"topic": topic}, {"topic": ""}, {"topic": {"$exists": False}}]
        sentences = await db.sentences.find(query, {"_id": 0}).to_list(max_s)
        if sentences:
            base += "\n\nSENTENCE BANK - Use these sentences during the lesson:\n"
            for i, s in enumerate(sentences, 1):
                base += f"{i}. TR: {s['turkish']} -> EN: {s['english']}\n"

    # Append document context
    if ai_config.get("use_documents", True):
        docs = await db.documents.find({}, {"_id": 0, "text_content": 1}).to_list(5)
        doc_texts = [d.get("text_content", "") for d in docs if d.get("text_content")]
        if doc_texts:
            combined = "\n".join(doc_texts)[:5000]
            base += f"\n\nTRAINING DOCUMENTS CONTEXT:\n{combined}\n"

    return base


def parse_structured_response(raw_response: str) -> dict:
    """Parse AI response to extract structured corrections and vocabulary"""
    corrections = []
    vocabulary = []
    clean_text = raw_response

    # Helper function to clean and parse JSON, even with markdown fences or leading/trailing characters
    def clean_and_parse_json(content: str) -> dict:
        content = content.strip()
        # Remove markdown fences like ```json or ```
        if content.startswith("```"):
            content = re.sub(r'^```(?:json)?\s*', '', content)
            content = re.sub(r'\s*```$', '', content)
        content = content.strip()
        
        # Try direct parsing first
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass
            
        # Try extracting JSON object using regex if there's surrounding text
        try:
            match = re.search(r'\{.*\}', content, re.DOTALL)
            if match:
                return json.loads(match.group(0))
        except Exception:
            pass
            
        return None

    # Extract [CORRECTION]...[/CORRECTION] blocks
    correction_pattern = re.compile(r'\[CORRECTION\](.*?)\[/CORRECTION\]', re.DOTALL)
    for match in correction_pattern.finditer(raw_response):
        data = clean_and_parse_json(match.group(1))
        if data:
            corrections.append({
                "original": data.get("original", ""),
                "correction": data.get("correction", ""),
                "explanation": data.get("explanation", ""),
                "turkish": data.get("turkish", "")
            })
    clean_text = correction_pattern.sub('', clean_text)

    # Extract [VOCABULARY]...[/VOCABULARY] blocks
    vocab_pattern = re.compile(r'\[VOCABULARY\](.*?)\[/VOCABULARY\]', re.DOTALL)
    for match in vocab_pattern.finditer(raw_response):
        data = clean_and_parse_json(match.group(1))
        if data:
            vocabulary.append({
                "word": data.get("word", ""),
                "meaning": data.get("meaning", ""),
                "example": data.get("example", "")
            })
    clean_text = vocab_pattern.sub('', clean_text)

    # Clean up extra whitespace
    clean_text = re.sub(r'\n{3,}', '\n\n', clean_text).strip()

    return {
        "text": clean_text,
        "corrections": corrections,
        "vocabulary": vocabulary
    }

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Tek sunucu: React build (FRONTEND_BUILD_PATH) + /api ayni process
_frontend_build = (os.environ.get("FRONTEND_BUILD_PATH") or "").strip()
if _frontend_build:
    _build_dir = Path(_frontend_build).resolve()
    if _build_dir.is_dir():
        _static = _build_dir / "static"
        if _static.is_dir():
            app.mount("/static", StaticFiles(directory=str(_static)), name="frontend-static")

        @app.get("/")
        async def serve_index():
            return FileResponse(_build_dir / "index.html")

        @app.get("/{asset_path:path}")
        async def serve_frontend(asset_path: str):
            if asset_path.startswith("api") or asset_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="Not found")
            target = (_build_dir / asset_path).resolve()
            try:
                target.relative_to(_build_dir)
            except ValueError:
                raise HTTPException(status_code=404, detail="Not found")
            if target.is_file():
                return FileResponse(target)
            return FileResponse(_build_dir / "index.html")

        logger.info("Unified mode: serving frontend from %s", _build_dir)
    else:
        logger.warning("FRONTEND_BUILD_PATH set but directory missing: %s", _build_dir)

@app.on_event("startup")
async def startup_event():
    await init_default_data()
    logger.info(f"TTS mode: {TTS_MODE} (fast=Edge-TTS ~1-2s, premium=Fish/Chatterbox)")

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
