# Tek sunucu kurulumu (önerilen)

Vercel + ayrı API + Supabase + Atlas yerine **tek process** çalıştırın:

| Ne | Adres |
|----|--------|
| Arayüz (React) | `https://speakking.edulim.net/` |
| API | `https://speakking.edulim.net/api/...` |
| Veritabanı | MongoDB (aynı sunucuda veya Atlas) |

## 1) Docker (en kolay)

```bash
cp .env.example .env
# .env icinde OPENROUTER_API_KEY ve JWT_SECRET duzenleyin

docker compose up -d --build
```

Tarayıcı: http://localhost:8000

## 2) Sunucuda script (Docker yok)

```bash
chmod +x scripts/run-production.sh
cp .env.example .env
# Mongo calisiyor olmali: mongodb://localhost:27017

./scripts/run-production.sh
```

Arka planda:

```bash
nohup ./scripts/run-production.sh > speakking.log 2>&1 &
```

## 3) Nginx + domain (edulim VPS)

1. Uygulama `127.0.0.1:8000` dinlesin (`run-production.sh` veya Docker).
2. `deploy/nginx-speakking.conf` → nginx sites-enabled.
3. `sudo nginx -t && sudo systemctl reload nginx`
4. `sudo certbot --nginx -d speakking.edulim.net`

## Geliştirme (ayrı portlar)

- Terminal 1: `cd backend && uvicorn server:app --reload --port 8001`
- Terminal 2: `cd frontend && yarn start`  
  (`frontend/.env.development` → API `http://localhost:8001`)

## Ortam değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `MONGO_URL` | `mongodb://localhost:27017` veya Atlas URI |
| `OPENROUTER_API_KEY` | Ders sohbeti için |
| `JWT_SECRET` | Giriş token |
| `FRONTEND_BUILD_PATH` | React `build` klasörü (tek sunucu) |

**Önemli:** Tek sunucuda `REACT_APP_BACKEND_URL` **boş** bırakın; frontend otomatik `window.location.origin/api` kullanır.

## Vercel’den geçiş

1. DNS `speakking.edulim.net` → VPS IP
2. Vercel projesini devre dışı bırakın veya alt domain kullanın
3. Yukarıdaki Docker/script + nginx ile yayına alın

Böylece 500 / FUNCTION_INVOCATION_FAILED gibi serverless limitleri ortadan kalkar; video dosyaları da normal diskten servis edilir.
