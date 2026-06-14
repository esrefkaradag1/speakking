/** Wav2Lip dudak senkronu — self-hosted GPU servisi uzerinden */

import { LESSON_VIDEOS } from './lessonMedia';

export function getAvatarProvider() {
  return (process.env.REACT_APP_AVATAR_PROVIDER || 'wav2lip').toLowerCase();
}

export function isWav2lipOnly() {
  const p = getAvatarProvider();
  return p === 'wav2lip' || process.env.REACT_APP_WAV2LIP_ENABLED === 'true';
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

export function avatarProviderPriority() {
  const p = getAvatarProvider();
  if (p === 'wav2lip') return ['wav2lip', 'mp4'];
  if (p === 'did') return ['did', 'mp4'];
  if (p === 'mp4') return ['mp4'];
  return ['wav2lip', 'mp4'];
}
