/** Ders oturumu: metin → ses → video tek akista */

export const LESSON_VIDEOS = {
  welcome: '/merhaba.mp4',
  idle: '/video2.mp4',
  speaking: '/video3.mp4',
};

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

export function waitForPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export async function waitAfterMessageReveal(scrollToEnd) {
  await waitForPaint();
  await delay(80);
  scrollToEnd?.();
  await delay(40);
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function unlockAudioElement(audioEl) {
  if (!audioEl) return false;
  try {
    const prev = audioEl.src;
    audioEl.muted = true;
    audioEl.src = SILENT_WAV;
    await audioEl.play();
    audioEl.pause();
    audioEl.currentTime = 0;
    audioEl.muted = false;
    audioEl.volume = 1;
    if (prev) audioEl.src = prev;
    else audioEl.removeAttribute('src');
    return true;
  } catch {
    return false;
  }
}

/** merhaba.mp4 — sessiz, bir kez */
export function playWelcomeVideo(introEl) {
  return new Promise((resolve) => {
    if (!introEl) {
      resolve();
      return;
    }
    const done = () => {
      introEl.removeEventListener('ended', done);
      introEl.removeEventListener('error', done);
      introEl.pause();
      try {
        introEl.currentTime = 0;
      } catch {
        /* ignore */
      }
      resolve();
    };
    introEl.loop = false;
    introEl.muted = true;
    introEl.volume = 0;
    introEl.currentTime = 0;
    introEl.addEventListener('ended', done, { once: true });
    introEl.addEventListener('error', done, { once: true });
    introEl.play().catch(done);
  });
}

export function waitForMediaReady(mediaEl, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    if (!mediaEl) {
      reject(new Error('Media element missing'));
      return;
    }
    if (mediaEl.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Media load timeout'));
    }, timeoutMs);
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(mediaEl.error || new Error('Media load error'));
    };
    const cleanup = () => {
      clearTimeout(timer);
      mediaEl.removeEventListener('canplay', onReady);
      mediaEl.removeEventListener('error', onError);
    };
    mediaEl.addEventListener('canplay', onReady, { once: true });
    mediaEl.addEventListener('error', onError, { once: true });
    mediaEl.load();
  });
}

/** Dudak senkronlu video klip */
export async function playVideoUrl(videoEl, url, { onSpeakStart, onSpeakEnd, isCancelled }) {
  if (!videoEl || !url) return;
  if (isCancelled?.()) return;

  videoEl.pause();
  videoEl.currentTime = 0;
  videoEl.loop = false;
  videoEl.muted = false;
  videoEl.volume = 1;
  videoEl.src = url;

  await waitForMediaReady(videoEl);
  if (isCancelled?.()) return;

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      videoEl.removeEventListener('playing', onPlaying);
      videoEl.removeEventListener('ended', onEnded);
      videoEl.removeEventListener('error', onError);
    };
    const onPlaying = () => {
      if (!isCancelled?.()) onSpeakStart?.();
    };
    const onEnded = () => {
      cleanup();
      if (!isCancelled?.()) onSpeakEnd?.();
      resolve();
    };
    const onError = () => {
      cleanup();
      onSpeakEnd?.();
      reject(videoEl.error || new Error('Video play error'));
    };
    videoEl.addEventListener('playing', onPlaying, { once: true });
    videoEl.addEventListener('ended', onEnded, { once: true });
    videoEl.addEventListener('error', onError, { once: true });
    videoEl.play().catch((e) => {
      cleanup();
      reject(e);
    });
  });
}

/** Tek ses dosyasi: playing → onSpeakStart, ended → onSpeakEnd */
export async function playAudioUrl(audioEl, url, { onSpeakStart, onSpeakEnd, isCancelled }) {
  if (!audioEl || !url) return;
  if (isCancelled?.()) return;

  audioEl.pause();
  audioEl.currentTime = 0;
  audioEl.muted = false;
  audioEl.volume = 1;
  audioEl.src = url;

  await waitForMediaReady(audioEl);
  if (isCancelled?.()) return;

  await new Promise((resolve, reject) => {
    const cleanup = () => {
      audioEl.removeEventListener('playing', onPlaying);
      audioEl.removeEventListener('ended', onEnded);
      audioEl.removeEventListener('error', onError);
    };
    const onPlaying = () => {
      if (!isCancelled?.()) onSpeakStart?.();
    };
    const onEnded = () => {
      cleanup();
      if (!isCancelled?.()) onSpeakEnd?.();
      resolve();
    };
    const onError = () => {
      cleanup();
      onSpeakEnd?.();
      reject(audioEl.error || new Error('Audio play error'));
    };
    audioEl.addEventListener('playing', onPlaying, { once: true });
    audioEl.addEventListener('ended', onEnded, { once: true });
    audioEl.addEventListener('error', onError, { once: true });
    audioEl.play().catch((err) => {
      cleanup();
      reject(err);
    });
  });
}

function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: mimeType });
}

/** Tum TTS segmentlerini paralel indir — sirali beklemeyi kaldir */
export async function prefetchTtsBlobs(segments, fetchSegmentAudio, { isCancelled } = {}) {
  const results = await Promise.all(
    segments.map(async (seg, index) => {
      if (isCancelled?.()) return { index, url: null };
      try {
        const data = await fetchSegmentAudio(seg);
        if (!data?.audio) return { index, url: null };
        const mime = data.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
        return { index, url: URL.createObjectURL(base64ToBlob(data.audio, mime)) };
      } catch {
        return { index, url: null };
      }
    })
  );
  return results
    .filter((r) => r.url)
    .sort((a, b) => a.index - b.index)
    .map((r) => r.url);
}

export function speakWithBrowserTts(text, lang) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window) || !text?.trim()) {
      resolve(false);
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang === 'tr' ? 'tr-TR' : 'en-US';
    u.volume = 1;
    u.rate = 1.08;
    u.pitch = 1.02;
    u.onend = () => resolve(true);
    u.onerror = () => resolve(false);
    window.speechSynthesis.speak(u);
  });
}
