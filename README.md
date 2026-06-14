# Speakking

Ingilizce konusma pratiği — **Supabase** (auth + veritabani) + React + opsiyonel AI proxy.

## Hizli baslangic

1. Supabase'de `supabase/schema.sql` calistirin
2. `.env.example` → `.env` ve `frontend/.env` / `backend/.env`
3. AI proxy: `cd backend && uvicorn ai_server:app --port 8001`
4. Frontend: `cd frontend && yarn start`

Veya tek komut: `bash scripts/start-dev.sh` (frontend + AI + Wav2Lip)

### Wav2Lip dudak senkronu

```bash
bash scripts/setup-wav2lip.sh          # ffmpeg modu (hizli)
bash scripts/start-wav2lip.sh          # http://localhost:5050
# backend/.env → WAV2LIP_SERVICE_URL=http://localhost:5050
# frontend/.env.development → REACT_APP_AVATAR_PROVIDER=wav2lip
```

Gercek Wav2Lip modeli: `bash scripts/setup-wav2lip.sh` (model indirir, GPU onerilir).  
Detay: [docker/wav2lip/README.md](docker/wav2lip/README.md)

Detay: [docs/SUPABASE_ONLY.md](docs/SUPABASE_ONLY.md)

**Vercel (tek proje, Supabase + AI):** [docs/VERCEL_DEPLOY.md](docs/VERCEL_DEPLOY.md)

## Eski yapi (kaldirildi)

- MongoDB — kullanilmiyor
- Vercel serverless API — kullanilmiyor
- `backend/server.py` — yalnizca referans; yeni kurulumda `ai_server.py` kullanin
