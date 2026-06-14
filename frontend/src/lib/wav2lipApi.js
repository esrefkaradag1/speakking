import axios from 'axios';
import { getAIAPI } from '../config';
import { getAuthHeaders } from './apiAuth';
import { speakText } from './apiAuth';

function base64ToBlob(b64, mime) {
  const byteCharacters = atob(b64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mime });
}

export async function checkWav2lipHealth() {
  try {
    const res = await axios.get(`${getAIAPI()}/avatar/wav2lip/health`, {
      headers: await getAuthHeaders(),
      timeout: 12000,
    });
    const svc = res.data?.service;
    return (
      res.data?.enabled !== false &&
      (res.data?.service_ok === true || svc?.ok === true)
    );
  } catch {
    return false;
  }
}

/** Sadece TTS — ders sesi hemen oynatilir */
export async function fetchTtsAudioUrl(text, lang = 'tr') {
  const tts = await speakText(text, lang);
  if (!tts.data?.audio) throw new Error('TTS bos dondu');
  const fmt = (tts.data.format || 'mp3').toLowerCase();
  const mime = fmt === 'wav' ? 'audio/wav' : 'audio/mpeg';
  return {
    url: URL.createObjectURL(base64ToBlob(tts.data.audio, mime)),
    provider: tts.data.provider,
  };
}

/** TTS + Wav2Lip → senkron MP4 (yavas; onizleme icin) */
export async function synthesizeLipSyncVideo(text, lang = 'tr') {
  const tts = await speakText(text, lang);
  if (!tts.data?.audio) throw new Error('TTS bos dondu');

  const fmt = (tts.data.format || 'mp3').toLowerCase();
  const syncRes = await axios.post(
    `${getAIAPI()}/avatar/wav2lip/sync`,
    { audio_base64: tts.data.audio, format: fmt },
    { headers: await getAuthHeaders(), timeout: 320000 }
  );

  if (!syncRes.data?.video_base64) {
    throw new Error(syncRes.data?.detail || 'Wav2Lip video uretilemedi');
  }
  const blob = base64ToBlob(syncRes.data.video_base64, 'video/mp4');
  return URL.createObjectURL(blob);
}
