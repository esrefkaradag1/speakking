# Yeni dil ve mod ekleme

## Diller (madde 7)

1. **Supabase** `scenarios` tablosuna yeni `level` / dil alani veya ayri `languages` tablosu ekleyin.
2. **Admin** panelinden cumle bankasi (`sentences`) ve senaryolar hedef dile gore etiketlenir.
3. **Backend** `ai_server.py` → `build_training_prompt()` icinde talimat dili ve `[SAY_TR]` yerine hedef dil etiketi.
4. **Frontend** `LandingPage.js` seviye/dil secimi; `LessonSession.js` icinde `recognitionRef.current.lang` (or. `de-DE`).
5. **TTS** `TTS_VOICE_*` env ve `synthesize_speech` ses kodlari.

## Modlar (madde 8)

1. Yeni mod = yeni **senaryo** kaydi (`scenarios`: `title`, `description`, `level`, `is_active`).
2. Istege bagli: `ai_config` icinde `system_prompt` ile mod davranisi (or. sadece kelime, rol yapma).
3. `build_training_prompt()` veya ayri `build_*_prompt(mode)` fonksiyonu; chat endpoint’te `scenario.mode` okunur.
4. Frontend’de ana sayfada senaryo listesi otomatik gelir; ozel UI modulu gerekiyorsa `LessonSession` altina mod bazli panel eklenir.

Mevcut ders akisi: senaryo → oturum → `/api/chat` + yapilandirilmis etiketler (`[SAY_TR]`, `[CORRECTION]`, `[VOCABULARY]`).
