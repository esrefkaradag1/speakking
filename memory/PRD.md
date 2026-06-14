# Speakking - AI Voice Translation Coach

## Original Problem Statement
Build a visually captivating, technically advanced English Speaking Practice Application where users practice translating Turkish sentences to English with AI feedback. (React, TailwindCSS, MongoDB Mock, Gemini/TTS-STT, Admin Dashboard, Level-based training, Real-time voice conversation).

## Architecture
- **Frontend:** React + TailwindCSS + Framer Motion + Shadcn/UI
- **Backend:** FastAPI + MongoDB (mock for Supabase) + Emergent LLM Integration (Gemini 2.5 Flash)
- **Voice:** OpenAI Whisper (STT) + OpenAI TTS
- **Storage:** Emergent Object Storage (for document uploads)
- **Design:** Glassmorphism 2.0, Dark Theme with Indigo/Emerald/Slate palette

## User Personas
1. **Language Learners:** Turkish speakers wanting to improve English translation skills
2. **Admin Users:** Manage scenarios, sentence banks, documents, AI training settings

## Core Requirements
- [x] JWT-based authentication (register/login)
- [x] Level selection (A1-C2 CEFR levels)
- [x] Scenario-based lessons with Turkish-English translation practice
- [x] Daily practice time tracking and limits
- [x] AI coach providing Turkish sentences and evaluating translations
- [x] Admin dashboard for scenario management
- [x] Global settings (daily limits, teacher tone, speech speed)
- [x] Voice input via Web Audio API (speech-to-text)
- [x] Text-to-speech for AI responses
- [x] Student Dashboard with progress tracking
- [x] Badge/Achievement system (14 badges)
- [x] Corrections review with voice playback
- [x] Hangman-style hint system
- [x] Admin AI Training System (Sentence Bank, Documents, AI Config)
- [x] **Structured Function Calling (reportCorrection, displayVocabularyHints)**

## What's Been Implemented

### Phase 1 (2026-04-06)
1. Landing Page (Turkish) - Hero, Speaky 3D avatar, level selector, scenario cards, auth modal
2. Lesson Session with VOICE - Real-time AI chat, voice recording, STT/TTS, Turkish UI
3. Student Dashboard - Progress stats, weekly activity, level progress, 14 badges, corrections review
4. Admin Dashboard - Stats, scenario CRUD, user management, global settings
5. Speaky Character - Realistic 3D avatar with talking animation

### Phase 2 (2026-04-07)
6. Sentence Bank - Admin CRUD + bulk import for Turkish-English sentence pairs
7. Document Upload - PDF/TXT/CSV/DOCX with text extraction via PyMuPDF
8. AI Training Config - Custom system prompt, teaching notes, toggles, max sentences
9. Training-Enhanced Chat - Dynamic prompts using sentence bank + documents + config

### Phase 3 (2026-04-07)
10. **reportCorrection** - AI returns structured correction data: original attempt, correct translation, explanation, Turkish source sentence. Displayed as visual CorrectionCard in sidebar.
11. **displayVocabularyHints** - Every AI response includes structured vocabulary: word, Turkish meaning, example sentence. Displayed as VocabularyCard with pronunciation button.
12. **parse_structured_response** - Backend parser extracts [CORRECTION] and [VOCABULARY] JSON blocks, returns clean text + structured arrays
13. **Enhanced Session Summary** - End-of-session modal shows vocabulary count, corrections count, messages count

## P1/P2 Features Remaining

### P1 (Important)
- [ ] Real Supabase integration (currently using MongoDB mock)

### P2 (Nice to Have)
- [ ] Vocabulary flashcards
- [ ] Pronunciation scoring
- [ ] Social sharing of progress
- [ ] Leaderboard
- [ ] Daily challenges

## Key API Endpoints
- POST /api/auth/register, /api/auth/login, GET /api/auth/me
- CRUD /api/scenarios
- POST /api/lessons/start, /api/lessons/{id}/end, GET /api/lessons/history
- POST /api/chat -> returns {response, corrections[], vocabulary[]}
- POST /api/voice/chat -> returns {ai_response, corrections[], vocabulary[], audio}
- POST /api/voice/transcribe, /api/voice/speak
- POST /api/hint/translate
- GET /api/student/progress, /api/student/badges, /api/student/recent-corrections
- CRUD /api/admin/sentences, POST /api/admin/sentences/bulk
- POST /api/admin/documents/upload, GET /api/admin/documents, DELETE /api/admin/documents/{id}
- GET/PUT /api/admin/ai-config
- GET/PUT /api/admin/settings, GET /api/admin/users, GET /api/admin/stats

## DB Collections
- `users`, `scenarios`, `lesson_sessions`, `sentences`, `documents`, `ai_config`, `admin_settings`
