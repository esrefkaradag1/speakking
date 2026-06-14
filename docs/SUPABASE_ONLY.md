# Supabase-only kurulum (Vercel + Mongo kapali)

## Mimari

| Katman | Teknoloji |
|--------|-----------|
| Auth + veritabani | **Supabase** |
| Arayuz | React static build |
| AI (sohbet, TTS) | `backend/ai_server.py` (opsiyonel, kucuk VPS) |

MongoDB ve Vercel **gerekmez**.

## 1) Supabase SQL

### A) CLI ile (onerilen)

```bash
# Dashboard → Settings → Database → Database password
export SUPABASE_DB_PASSWORD='...'
chmod +x scripts/supabase-remote.sh
./scripts/supabase-remote.sh --seed
```

Bu script `supabase/apply-canli-500.sql` ile RLS 500 hatasini duzeltir; `--seed` ile senaryo/cumle verisini yukler.

Kendi Supabase hesabinizdaki **speakking** projesi (`ncyiwmozrbivoiickxdf`) duraklatilmissa once [dashboard](https://supabase.com/dashboard/project/ncyiwmozrbivoiickxdf) uzerinden **Resume** edin, sonra:

```bash
export SUPABASE_PROJECT_REF=ncyiwmozrbivoiickxdf
export SUPABASE_DB_PASSWORD='...'
./scripts/supabase-remote.sh --seed
```

`.env` icindeki URL ve anon key'i yeni projeye guncelleyin.

### B) SQL Editor (sifre yoksa)

1. [Supabase Dashboard](https://supabase.com/dashboard) → SQL Editor
2. `supabase/apply-canli-500.sql` → **Run** (500 hatasi icin)
3. (Opsiyonel) `supabase/import-from-mongo.sql` → seed
4. Ilk kurulumda: `supabase/schema.sql`

## 2) Supabase Auth

- Authentication → Providers → Email acik
- Test icin "Confirm email" kapatabilirsiniz

Admin:

```sql
update public.profiles set is_admin = true where email = 'admin@speakking.com';
```

## 3) Ortam degiskenleri

`cp .env.example .env` ve doldurun:

- `REACT_APP_SUPABASE_URL` / `REACT_APP_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (sadece ai_server icin, gizli tutun)
- `SUPABASE_JWT_SECRET` (Settings → API → JWT Secret / Legacy)
- `OPENROUTER_API_KEY`

`backend/.env` ayni degerleri icermeli (AI proxy icin).

## 4) Frontend

```bash
cd frontend
yarn install
yarn add @supabase/supabase-js   # ilk kurulumda
cp ../.env.example .env   # veya .env.local
yarn start
```

Production build:

```bash
REACT_APP_AI_API_URL=https://ai.speakking.edulim.net yarn build
```

Static dosyalari sunun: Netlify, Cloudflare Pages, nginx, veya Supabase Storage.

## 5) AI proxy (ders sohbeti)

```bash
cd backend
pip install -r requirements-deploy.txt
uvicorn ai_server:app --reload --port 8001
```

Docker:

```bash
docker compose up -d --build
```

## 6) Vercel'i kapatma

1. Vercel projesinde domain alias kaldirin
2. DNS → yeni static host veya VPS
3. `api/` klasoru artik kullanilmiyor

## Ozet

- Giris / senaryolar / admin → **dogrudan Supabase**
- `/api/chat`, `/api/voice/speak` → **ai_server** + Supabase JWT
