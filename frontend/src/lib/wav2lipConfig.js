/** Wav2Lip dudak senkronu — self-hosted GPU servisi uzerinden */

import { getDidConfig } from './didConfig';
import { LESSON_VIDEOS } from './lessonMedia';

export function getAvatarProvider() {
  return (process.env.REACT_APP_AVATAR_PROVIDER || 'mp4').toLowerCase();
}

export function isWav2lipOnly() {
  const p = getAvatarProvider();
  // Sadece acikca wav2lip secildiyse diger avatarlari engelle
  return p === 'wav2lip';
}

export function getWav2lipConfig() {
  const provider = getAvatarProvider();
  const faceVideoUrl =
    (process.env.REACT_APP_WAV2LIP_FACE_URL || '').trim() || LESSON_VIDEOS.idle;
  const enabled =
    provider === 'wav2lip' ||
    provider === 'auto' ||
    process.env.REACT_APP_WAV2LIP_ENABLED === 'true';

  return {
    enabled,
    faceVideoUrl,
    provider,
    only: isWav2lipOnly(),
  };
}

/** Ilk acilista — varsayilan: kendi MP4 (ucretsiz). D-ID sadece acikca photo/did. */
export function getInitialAvatarMode() {
  const provider = getAvatarProvider();
  const wav2 = getWav2lipConfig();

  if (provider === 'mp4') return 'mp4';
  if (provider === 'photo' || provider === 'did') return 'photo';
  if (provider === 'wav2lip' && wav2.enabled) return 'wav2lip';
  if (provider === 'three') return 'three';
  if (provider === 'auto') {
    if (wav2.enabled) return 'wav2lip';
    return 'mp4';
  }
  return 'mp4';
}

/** Basarisiz moddan sonraki yedek */
export function getAvatarFallback(failedMode) {
  // photo ve did ayni D-ID kredisini kullanir — birinde kredi yoksa digeri de olmaz
  const order =
    failedMode === 'photo' || failedMode === 'did'
      ? ['mp4', 'wav2lip', 'three']
      : ['photo', 'did', 'mp4', 'wav2lip', 'three'];
  const did = getDidConfig();
  const wav2 = getWav2lipConfig();
  const start =
    failedMode === 'photo' || failedMode === 'did'
      ? -1
      : order.indexOf(failedMode);
  for (let i = start + 1; i < order.length; i += 1) {
    const mode = order[i];
    if ((mode === 'did' || mode === 'photo') && !did.enabled) continue;
    if (mode === 'wav2lip' && !wav2.enabled) continue;
    return mode;
  }
  return 'mp4';
}

export function avatarProviderPriority() {
  const p = getAvatarProvider();
  if (p === 'wav2lip') return ['wav2lip', 'mp4'];
  if (p === 'did') return ['did', 'mp4'];
  if (p === 'mp4') return ['mp4'];
  return ['wav2lip', 'mp4'];
}
