# Vercel deploy (Supabase + AI — tek proje)

Frontend ve AI API ayni Vercel projesinde. Veritabani ve auth **Supabase** (ayri hesap).

## Mimari (Vercel FastAPI — tek function)

| Parca | Nerede |
|--------|--------|
| React UI | `public/` (build sonrasi kopyalanir) |
| `/api/chat`, `/api/voice/speak` | `backend/ai_server.py` (`pyproject.toml` entrypoint) |
| Auth + DB | Supabase (client + service role) |

`REACT_APP_AI_API_URL` **bos birakilir** — frontend otomatik `https://sizin-domain.com/api` kullanir.

Gerekli dosyalar: `pyproject.toml`, `scripts/vercel-build.sh`, `vercel.json`

## 1) Supabase SQL (bir kez)

Dashboard → SQL Editor:

1. `supabase/fix-is-admin-volatile.sql`
2. `supabase/add-elevenlabs-settings.sql`
3. `supabase/apply-canli-500.sql`

## 2) Vercel Environment Variables

Project → Settings → Environment Variables (Production + Preview):

| Degisken | Ornek | Not |
|----------|--------|-----|
| `REACT_APP_SUPABASE_URL` | `https://xxx.supabase.co` | Build icin |
| `REACT_APP_SUPABASE_ANON_KEY` | `eyJ...` | Build icin |
| `SUPABASE_URL` | ayni URL | AI icin |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` service_role | Gizli |
| `SUPABASE_JWT_SECRET` | Legacy JWT secret | AI JWT |
| `OPENROUTER_API_KEY` | `sk-or-...` | Ders sohbeti |
| `CORS_ORIGINS` | `https://speakking.edulim.net` | Virgulle birden fazla domain |

**Bos birakin (aynı origin):**

- `REACT_APP_AI_API_URL` — tanimlamayin veya bos

Opsiyonel TTS:

- ElevenLabs admin panelinden (tercih)
- `ELEVENLABS_API_KEY` env (yedek)

## 3) Deploy

```bash
npm i -g vercel   # ilk kez
cd speakkinf-new-main
vercel login
vercel link       # projeyi bagla
vercel --prod
```

veya GitHub repo baglayip Vercel Dashboard → Import → auto deploy.

## 4) Build ayarlari (Dashboard)

`vercel.json` komutlari kullanir. Dashboard’da **eski** `npm install` veya eksik `requirements.txt` varsa deploy patlar — asagidaki gibi **Override** acin veya alanlari bos birakin:

| Alan | Deger |
|------|--------|
| Root Directory | `.` (repo kok) |
| Framework Preset | **Other** |
| Install Command | *(bos — `vercel.json` kullanir)* veya: `pip install -r requirements.txt && cd frontend && yarn install --frozen-lockfile` |
| Build Command | *(bos — `vercel.json` kullanir)* veya: `bash scripts/vercel-build.sh` |
| Output Directory | *(bos)* |

Kokte `requirements.txt` + `frontend/yarn.lock` olmali.

CLI: `vercel --prod` (min. Vercel CLI 48.1.8 onerilir)

## 5) Video dosyalari

`video1.mp4`, `video2.mp4`, `video3.mp4` dosyalarini **`frontend/public/`** icine koyun (build ile birlikte yayinlanir).

## 6) Kontrol

- `https://DOMAIN/` — giris
- `https://DOMAIN/api/health` — `{"status":"ok",...}`
- Ders baslat — sohbet + ses

## Sinirlar

- Vercel Hobby: function timeout ~10s (uzun TTS/chat Pro gerekebilir, `maxDuration: 60` Pro plan)
- Ilk istek cold start 2–5 sn olabilir
- Cok agir paketler (Chatterbox vb.) **kullanilmiyor** — sadece `ai_server.py` minimal bagimliliklar

## Sorun giderme

| Sorun | Cozum |
|--------|--------|
| `pip install -r requirements.txt ... exited with 1` | Kok `requirements.txt` ekli mi; Dashboard Install’da `npm` yerine `yarn`; Override ile `vercel.json` komutlarini kullan |
| `vercel-build.sh exited with 1` (eslint hooks) | Vercel `CI=true` kullanir; `scripts/vercel-build.sh` icinde `CI=false` (zaten ayarli) |
| 500 `/api/*` | Vercel Logs → env eksik mi kontrol |
| Frontend acilmiyor | `REACT_APP_*` build env |
| Admin kayit 400 | `fix-is-admin-volatile.sql` calistir |
| TTS timeout | Pro plan veya `maxDuration` artir |
