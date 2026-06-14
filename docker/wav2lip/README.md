# Wav2Lip dudak senkronu

Speakking, **Wav2Lip** ile öğretmen videosuna TTS sesini senkronize edebilir (D-ID alternatifi, self-hosted).

## Gereksinimler

- NVIDIA GPU (önerilir; CPU çok yavaş)
- [Wav2Lip](https://github.com/Rudrabha/Wav2Lip) repo + `wav2lip_gan.pth` checkpoint
- Python 3.10+

## Mikroservisi başlatma

```bash
export WAV2LIP_REPO=/path/to/Wav2Lip
export WAV2LIP_CHECKPOINT=$WAV2LIP_REPO/checkpoints/wav2lip_gan.pth
export WAV2LIP_FACE_VIDEO=/path/to/yuz_videosu.mp4   # on yuz, net dudak

cd docker/wav2lip
pip install fastapi uvicorn httpx python-multipart
uvicorn app:app --host 0.0.0.0 --port 5000
```

## Speakking backend (.env)

```env
WAV2LIP_SERVICE_URL=http://localhost:5000
WAV2LIP_FACE_PATH=/path/to/speakkinf/public/video2.mp4
# veya uzak URL:
# WAV2LIP_FACE_URL=https://...

REACT_APP_AVATAR_PROVIDER=wav2lip
```

`auto` modunda önce Wav2Lip health kontrol edilir, yoksa D-ID, sonra MP4.

## Frontend (.env.development)

```env
REACT_APP_AVATAR_PROVIDER=wav2lip
REACT_APP_WAV2LIP_FACE_URL=/video2.mp4
```

## Notlar

- Her cümle için video üretimi **5–30 sn** sürebilir (GPU’ya bağlı).
- D-ID gibi canlı WebRTC değil; **üret → oynat** modeli.
- Türkçe ses kalitesi mevcut TTS ayarlarınızdan gelir (OpenRouter / Edge).
